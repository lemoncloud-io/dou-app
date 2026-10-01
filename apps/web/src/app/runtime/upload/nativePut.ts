import type { OnFileTransferStatePayload } from '@chatic/app-messages';
import type { IWebBridgeClient } from '@chatic/bridges';
import {
    chatAttachmentFormat,
    type PutPort,
    type PutResult,
    type ShellFilePutPort,
    type UploadPutTarget,
} from '@chatic/data';

export type TransferBridge = Pick<IWebBridgeClient, 'request' | 'onEvent'>;

/**
 * The bytes cross the bridge once as base64 before the shell streams them from disk. The default
 * request timeout is sized for small commands; a 20MB photo is ~27MB of base64.
 */
const WRITE_TEMP_FILE_TIMEOUT_MS = 120_000;

const isTerminal = (state: OnFileTransferStatePayload['state']) => state !== 'running';

/**
 * The shell answers, it never judges: a response of any status arrives as `responded`, and only
 * transfers that got no response at all are `failed`. `cancelled` can only come from the OS here —
 * nothing in this app cancels.
 */
export const toPutResult = (state: OnFileTransferStatePayload): PutResult => {
    if (state.state === 'responded') {
        return {
            kind: 'responded',
            httpStatus: state.httpStatus ?? 0,
            ...(state.providerCode ? { providerCode: state.providerCode } : {}),
        };
    }
    if (state.state === 'failed' && state.errorCode === 'NETWORK') return { kind: 'no-response', reason: 'network' };
    if (state.state === 'failed' && state.errorCode === 'SOURCE') return { kind: 'no-response', reason: 'source' };
    return { kind: 'no-response', reason: 'system' };
};

const codeOf = (error: unknown) => (error as { code?: string } | null)?.code;
const isNotFound = (error: unknown) => codeOf(error) === 'NOT_FOUND';

const readBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });

export interface NativeTransfers {
    /**
     * PUTs a page file: an image through the shell's transfer module (or through `fallback` on a shell
     * without one), a video or document through `fallback` always.
     */
    put: PutPort;
    /** PUTs a file the shell keeps, from where it lies. */
    putShellFile: ShellFilePutPort;
    /** Settles a waiting `put` from a terminal state learned some other way. Returns whether one was waiting. */
    settle(state: OnFileTransferStatePayload): boolean;
    /** Transfer ids this page is still waiting on, counting only those the shell accepted. */
    waiting(): string[];
    /** True once a shell without the transfer module was detected; stays true for the page's life. */
    usesFallback(): boolean;
    acknowledge(transferIds: string[]): Promise<void>;
    dispose(): void;
}

export interface NativeTransfersOptions {
    bridge: TransferBridge;
    /** What an old shell uses instead: the page's own PUT, alive only while the app is in front. */
    fallback: PutPort;
    newTransferId?: () => string;
    log?: (message: string, data?: Record<string, unknown>) => void;
}

/**
 * PUTs through the native shell so the bytes keep moving with the app in the background.
 *
 * Each PUT is: write the bytes to a temp file → start a transfer → wait for its one terminal state →
 * acknowledge it, so the shell can drop the record it keeps for a page that might have missed the
 * event.
 *
 * **An old shell is detected by its first answer.** A shell built before the transfer module
 * rejects the message with `NOT_FOUND`; that call is redone with `fallback`, and every later one
 * goes straight there. There is no capability handshake to ask instead.
 */
export const createNativeTransfers = ({
    bridge,
    fallback,
    newTransferId = () => crypto.randomUUID(),
    log = () => undefined,
}: NativeTransfersOptions): NativeTransfers => {
    const waiters = new Map<string, (result: PutResult) => void>();
    // Accepted by the shell. A waiter is registered before its start request, so until the reply it
    // is legitimately absent from the shell's list and must not be taken for a lost transfer.
    const accepted = new Set<string>();
    let fallbackOnly = false;
    // One temp-file write at a time. The PUTs run in parallel, but each write holds the whole file as
    // base64 in page memory (and again in the bridge message), and three 20MB photos at once is
    // enough to take a WebView down.
    let writing: Promise<unknown> = Promise.resolve();
    const oneWriteAtATime = <T>(work: () => Promise<T>): Promise<T> => {
        const next = writing.then(work, work);
        writing = next.catch(() => undefined);
        return next;
    };

    const acknowledge = async (transferIds: string[]) => {
        if (transferIds.length === 0) return;
        try {
            await bridge.request({ type: 'AckFileTransfers', data: { transferIds } });
        } catch (error) {
            // Not fatal: an unacknowledged result is only held until the shell's cap evicts it.
            log('native transfer: ack failed', { count: transferIds.length, code: (error as { code?: string })?.code });
        }
    };

    const settle = (state: OnFileTransferStatePayload) => {
        if (!isTerminal(state.state)) return false;
        const resolve = waiters.get(state.transferId);
        if (!resolve) return false;
        waiters.delete(state.transferId);
        accepted.delete(state.transferId);
        resolve(toPutResult(state));
        return true;
    };

    const unsubscribe = bridge.onEvent('OnFileTransferState', message => {
        const state = message.data;
        if (state && settle(state)) void acknowledge([state.transferId]);
    });

    const switchToFallback = () => {
        if (!fallbackOnly) log('native transfer: shell has no transfer module, using page uploads');
        fallbackOnly = true;
    };

    /** Starts the transfer of a local file the shell can read and waits for its one terminal state. */
    const startTransfer = async (
        target: UploadPutTarget,
        file: { uri: string; contentType: string; contentLength: number },
        label: string
    ): Promise<PutResult | 'fallback'> => {
        const transferId = newTransferId();
        // Registered before the start request: the first state can arrive before its reply does.
        const result = new Promise<PutResult>(resolve => waiters.set(transferId, resolve));
        try {
            await bridge.request({
                type: 'StartFileTransfer',
                data: {
                    transferId,
                    direction: 'upload',
                    url: target.url,
                    method: 'PUT',
                    headers: target.headers,
                    // The shell requires the length for an upload, rejects the start without it, and
                    // checks it against the file.
                    file,
                },
            });
            if (waiters.has(transferId)) accepted.add(transferId);
        } catch (error) {
            waiters.delete(transferId);
            if (isNotFound(error)) return 'fallback';
            log('native transfer: start refused', { label, code: codeOf(error) });
            // iOS refuses a source file that is gone at the start; Android fails it once it reads it.
            // Either way it is the same lost file, which a retry cannot send.
            return { kind: 'no-response', reason: codeOf(error) === 'SOURCE' ? 'source' : 'system' };
        }
        return result;
    };

    const put: PutPort = async (target, file, label) => {
        if (fallbackOnly) return fallback(target, file, label);
        // Only an image crosses the bridge. A page video or document would have to go over whole, as
        // base64 in one message, and a WebView does not survive that for a 300MB file. The page PUT
        // streams the picked file from disk instead — at the cost of stopping with the page.
        if (chatAttachmentFormat(file)?.kind !== 'image') return fallback(target, file, label);

        const written = await oneWriteAtATime(async (): Promise<{ uri: string } | PutResult | 'fallback'> => {
            let base64: string;
            try {
                base64 = await readBase64(file);
            } catch {
                return { kind: 'no-response', reason: 'source' };
            }
            try {
                const reply = await bridge.request(
                    { type: 'WriteTempFile', data: { base64, fileName: file.name } },
                    { timeoutMs: WRITE_TEMP_FILE_TIMEOUT_MS }
                );
                return reply.data?.uri ? { uri: reply.data.uri } : { kind: 'no-response', reason: 'system' };
            } catch (error) {
                if (isNotFound(error)) return 'fallback';
                log('native transfer: temp file failed', { label, code: codeOf(error) });
                // The shell answers a failed write with SOURCE: a local-file problem, not a system one.
                return { kind: 'no-response', reason: codeOf(error) === 'SOURCE' ? 'source' : 'system' };
            }
        });
        if (written === 'fallback') {
            switchToFallback();
            return fallback(target, file, label);
        }
        if (!('uri' in written)) return written;
        const started = await startTransfer(
            target,
            { uri: written.uri, contentType: file.type, contentLength: file.size },
            label
        );
        if (started !== 'fallback') return started;
        switchToFallback();
        return fallback(target, file, label);
    };

    // A shell file exists only in an app whose shell has the transfer module, so there is no page
    // fallback to fall to: a shell file reaching an old shell fails its slot.
    const putShellFile: ShellFilePutPort = async (target, file, label) => {
        if (fallbackOnly) return { kind: 'no-response', reason: 'system' };
        const started = await startTransfer(
            target,
            { uri: file.uri, contentType: file.type, contentLength: file.size },
            label
        );
        return started === 'fallback' ? { kind: 'no-response', reason: 'system' } : started;
    };

    return {
        put,
        putShellFile,
        settle,
        waiting: () => [...accepted],
        usesFallback: () => fallbackOnly,
        acknowledge,
        dispose: () => {
            unsubscribe();
            // Nothing may be left hanging on a transfer nobody will report any more.
            for (const resolve of waiters.values()) resolve({ kind: 'no-response', reason: 'system' });
            waiters.clear();
            accepted.clear();
        },
    };
};

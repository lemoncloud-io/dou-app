import type { OnFileTransferStatePayload } from '@chatic/bridge-messages';
import type { IWebBridgeClient } from '@chatic/bridges';
import {
    chatAttachmentFormat,
    type PutPort,
    type PutProgress,
    type PutResult,
    type ShellFilePutPort,
    type UploadPutTarget,
} from '@chatic/runtime-react';

export type TransferBridge = Pick<IWebBridgeClient, 'request' | 'onEvent'>;

const WRITE_TEMP_FILE_TIMEOUT_MS = 120_000;

const isTerminal = (state: OnFileTransferStatePayload['state']) => state !== 'running';

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

const readBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });

export interface NativeTransfers {
    put: PutPort;
    putShellFile: ShellFilePutPort;
    settle(state: OnFileTransferStatePayload): boolean;
    waiting(): string[];
    acknowledge(transferIds: string[]): Promise<void>;
    dispose(): void;
}

export interface NativeTransfersOptions {
    bridge: TransferBridge;
    fallback: PutPort;
    newTransferId?: () => string;
    log?: (message: string, data?: Record<string, unknown>) => void;
}

export const createNativeTransfers = ({
    bridge,
    fallback,
    newTransferId = () => crypto.randomUUID(),
    log = () => undefined,
}: NativeTransfersOptions): NativeTransfers => {
    const waiters = new Map<string, (result: PutResult) => void>();
    const progressOf = new Map<string, PutProgress>();
    const accepted = new Set<string>();
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
            log('native transfer: ack failed', { count: transferIds.length, code: (error as { code?: string })?.code });
        }
    };

    const settle = (state: OnFileTransferStatePayload) => {
        if (!isTerminal(state.state)) return false;
        const resolve = waiters.get(state.transferId);
        if (!resolve) return false;
        waiters.delete(state.transferId);
        accepted.delete(state.transferId);
        progressOf.delete(state.transferId);
        resolve(toPutResult(state));
        return true;
    };

    const unsubscribe = bridge.onEvent('OnFileTransferState', message => {
        const state = message.data;
        if (!state) return;
        if (state.state === 'running') {
            progressOf.get(state.transferId)?.(state.transferredBytes);
            return;
        }
        if (settle(state)) void acknowledge([state.transferId]);
    });

    const startTransfer = async (
        target: UploadPutTarget,
        file: { uri: string; contentType: string; contentLength: number },
        label: string,
        onProgress: PutProgress | undefined
    ): Promise<PutResult> => {
        const transferId = newTransferId();
        const result = new Promise<PutResult>(resolve => waiters.set(transferId, resolve));
        if (onProgress) progressOf.set(transferId, onProgress);
        try {
            await bridge.request({
                type: 'StartFileTransfer',
                data: {
                    transferId,
                    direction: 'upload',
                    url: target.url,
                    method: 'PUT',
                    headers: target.headers,
                    file,
                },
            });
            if (waiters.has(transferId)) accepted.add(transferId);
        } catch (error) {
            waiters.delete(transferId);
            progressOf.delete(transferId);
            log('native transfer: start refused', { label, code: codeOf(error) });
            return { kind: 'no-response', reason: codeOf(error) === 'SOURCE' ? 'source' : 'system' };
        }
        return result;
    };

    const put: PutPort = async (target, file, label, onProgress) => {
        if (chatAttachmentFormat(file)?.kind !== 'image') return fallback(target, file, label, onProgress);

        const written = await oneWriteAtATime(async (): Promise<{ uri: string } | PutResult> => {
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
                log('native transfer: temp file failed', { label, code: codeOf(error) });
                return { kind: 'no-response', reason: codeOf(error) === 'SOURCE' ? 'source' : 'system' };
            }
        });
        if (!('uri' in written)) return written;
        return startTransfer(
            target,
            { uri: written.uri, contentType: file.type, contentLength: file.size },
            label,
            onProgress
        );
    };

    const putShellFile: ShellFilePutPort = (target, file, label, onProgress) =>
        startTransfer(target, { uri: file.uri, contentType: file.type, contentLength: file.size }, label, onProgress);

    return {
        put,
        putShellFile,
        settle,
        waiting: () => [...accepted],
        acknowledge,
        dispose: () => {
            unsubscribe();
            for (const resolve of waiters.values()) resolve({ kind: 'no-response', reason: 'system' });
            waiters.clear();
            accepted.clear();
            progressOf.clear();
        },
    };
};

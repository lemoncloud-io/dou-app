import type { DownloadedFile, OnFileTransferStatePayload } from '@chatic/app-messages';
import type { IWebBridgeClient } from '@chatic/bridges';

export type DownloadBridge = Pick<IWebBridgeClient, 'request' | 'onEvent'>;

/** How one download ended, as the image export reads it. */
export type DownloadResult =
    /** A 2xx, with the file the shell kept. Acknowledge it once the file has been used. */
    | { kind: 'file'; file: DownloadedFile }
    /** Any other status. 403 is an expired signature. */
    | { kind: 'responded'; httpStatus: number; providerCode?: string }
    | { kind: 'failed'; reason: 'network' | 'source' | 'system' | 'other' }
    /** No byte moved for the stall window, so it was cancelled here. */
    | { kind: 'stalled' }
    | { kind: 'cancelled' }
    /** The shell answered `NOT_FOUND` — an app built before downloads. */
    | { kind: 'unsupported' };

export interface DownloadProgress {
    transferredBytes: number;
    /** `0` while the length is unknown. */
    totalBytes: number;
}

export interface NativeDownload {
    transferId: string;
    result: Promise<DownloadResult>;
    /** Stops it. Resolves `result` as `cancelled` at once; the shell's own `cancelled` is acknowledged when it comes. */
    cancel(): void;
}

export interface StartDownloadInput {
    url: string;
    /** File name hint. The shell cleans it and takes the extension from the bytes. */
    name?: string;
    /** Shown in the Android transfer notification. */
    title?: string;
    onProgress?: (progress: DownloadProgress) => void;
}

export interface NativeDownloads {
    start(input: StartDownloadInput): NativeDownload;
    acknowledge(transferIds: string[]): Promise<void>;
    /**
     * Catches up after the page was away: settles waiting downloads from what the shell holds, and
     * acknowledges ended downloads nobody waits for any more. Uploads are not touched.
     */
    sync(): Promise<void>;
    dispose(): void;
}

export interface NativeDownloadsOptions {
    bridge: DownloadBridge;
    newTransferId?: () => string;
    /** No byte for this long cancels the download. */
    stallMs?: number;
    log?: (message: string, data?: Record<string, unknown>) => void;
}

/**
 * Thirty seconds without a byte — the same window the shell uses to close the iOS upload progress
 * UI. iOS keeps a download whose connection dropped `running` and retries it in the background for
 * as long as days, so without a window here the button would never come back.
 */
export const DOWNLOAD_STALL_MS = 30_000;

const codeOf = (error: unknown) => (error as { code?: string } | null)?.code;

const isOk = (status: number | undefined) => status !== undefined && status >= 200 && status < 300;

/** Reads a terminal state the way the export needs it. A 2xx with no file is the shell losing it. */
export const toDownloadResult = (state: OnFileTransferStatePayload): DownloadResult => {
    if (state.state === 'responded') {
        if (isOk(state.httpStatus)) {
            return state.file ? { kind: 'file', file: state.file } : { kind: 'failed', reason: 'source' };
        }
        return {
            kind: 'responded',
            httpStatus: state.httpStatus ?? 0,
            ...(state.providerCode ? { providerCode: state.providerCode } : {}),
        };
    }
    if (state.state === 'cancelled') return { kind: 'cancelled' };
    switch (state.errorCode) {
        case 'NETWORK':
            return { kind: 'failed', reason: 'network' };
        case 'SOURCE':
            return { kind: 'failed', reason: 'source' };
        case 'SYSTEM':
            return { kind: 'failed', reason: 'system' };
        default:
            return { kind: 'failed', reason: 'other' };
    }
};

interface Waiter {
    resolve: (result: DownloadResult) => void;
    onProgress?: (progress: DownloadProgress) => void;
    accepted: boolean;
    lastBytes: number;
    timer?: ReturnType<typeof setTimeout>;
}

/**
 * Downloads through the native shell's transfer module — the counterpart of `nativePut`.
 *
 * Each download is: register a waiter → start the transfer → wait for its one terminal state. The
 * waiter goes first because the first state can arrive before the start's reply. A download that
 * brought a file is acknowledged by the caller once the file has been used; one that brought none is
 * acknowledged here at once. The catch-up also acknowledges ended downloads nobody waits for — left
 * by a page that no longer exists. Acknowledging drops only the shell's record, never the file.
 */
export const createNativeDownloads = ({
    bridge,
    newTransferId = () => crypto.randomUUID(),
    stallMs = DOWNLOAD_STALL_MS,
    log = () => undefined,
}: NativeDownloadsOptions): NativeDownloads => {
    const waiters = new Map<string, Waiter>();
    // Downloads this page gave up on (cancelled or stalled): their terminal state is acknowledged
    // when it arrives, since nothing else will.
    const abandoned = new Set<string>();

    const acknowledge = async (transferIds: string[]) => {
        if (transferIds.length === 0) return;
        try {
            await bridge.request({ type: 'AckFileTransfers', data: { transferIds } });
        } catch (error) {
            // Not fatal: the shell holds an unacknowledged result only until its cap evicts it.
            log('native download: ack failed', { count: transferIds.length, code: codeOf(error) });
        }
    };

    const finish = (transferId: string, result: DownloadResult) => {
        const waiter = waiters.get(transferId);
        if (!waiter) return false;
        if (waiter.timer) clearTimeout(waiter.timer);
        waiters.delete(transferId);
        waiter.resolve(result);
        return true;
    };

    const giveUp = (transferId: string, result: DownloadResult) => {
        if (!finish(transferId, result)) return;
        abandoned.add(transferId);
        bridge.request({ type: 'CancelFileTransfer', data: { transferId } }).catch(error => {
            // Already ended: its terminal state is (or was) on the way and gets acknowledged then.
            log('native download: cancel refused', { code: codeOf(error) });
        });
    };

    /**
     * The window ran out. Before cancelling, ask the shell where the download really is: on iOS the
     * page's timers keep counting while the app is suspended, so a download that finished in the
     * background meets an expired timer on return — ahead of its own terminal event.
     */
    const checkStall = async (transferId: string) => {
        const waiter = waiters.get(transferId);
        if (!waiter) return;
        const bytesAtStall = waiter.lastBytes;
        let held: OnFileTransferStatePayload | undefined;
        try {
            const listed = await bridge.request({ type: 'ListFileTransfers', data: {} });
            held = listed.data?.transfers?.find(
                state => state.transferId === transferId && state.direction === 'download'
            );
        } catch {
            // No answer: judge by what the page saw.
        }
        if (!waiters.has(transferId)) return;
        if (held && (held.state !== 'running' || held.transferredBytes > bytesAtStall)) {
            // Ended, or still moving: the ordinary rules settle it or start the window again.
            onState(held);
            return;
        }
        log('native download: stalled, cancelling');
        giveUp(transferId, { kind: 'stalled' });
    };

    const armStall = (transferId: string) => {
        const waiter = waiters.get(transferId);
        if (!waiter) return;
        if (waiter.timer) clearTimeout(waiter.timer);
        waiter.timer = setTimeout(() => void checkStall(transferId), stallMs);
    };

    /** A state from an event or from the list — the same rules either way. Uploads are not ours. */
    const onState = (state: OnFileTransferStatePayload): void => {
        if (state.direction !== 'download') return;
        const { transferId } = state;
        if (state.state === 'running') {
            const waiter = waiters.get(transferId);
            if (!waiter) return;
            waiter.onProgress?.({ transferredBytes: state.transferredBytes, totalBytes: state.totalBytes });
            if (state.transferredBytes > waiter.lastBytes) {
                waiter.lastBytes = state.transferredBytes;
                if (waiter.accepted) armStall(transferId);
            }
            return;
        }
        if (abandoned.delete(transferId)) {
            void acknowledge([transferId]);
            return;
        }
        const result = toDownloadResult(state);
        if (!finish(transferId, result)) return;
        // A file is acknowledged by whoever uses it; anything else has nothing left to keep.
        if (result.kind !== 'file') void acknowledge([transferId]);
    };

    const unsubscribe = bridge.onEvent('OnFileTransferState', message => {
        if (message.data) onState(message.data);
    });

    const start = ({ url, name, title, onProgress }: StartDownloadInput): NativeDownload => {
        const transferId = newTransferId();
        const result = new Promise<DownloadResult>(resolve => {
            waiters.set(transferId, { resolve, onProgress, accepted: false, lastBytes: 0 });
        });
        bridge
            .request({
                type: 'StartFileTransfer',
                data: {
                    transferId,
                    direction: 'download',
                    url,
                    method: 'GET',
                    ...(title ? { title } : {}),
                    ...(name ? { file: { name } } : {}),
                },
            })
            .then(() => {
                const waiter = waiters.get(transferId);
                if (!waiter) return;
                waiter.accepted = true;
                // The first running state (0 bytes) is where the window starts.
                armStall(transferId);
            })
            .catch(error => {
                const code = codeOf(error);
                if (code === 'NOT_FOUND' || code === 'INVALID') {
                    if (code === 'INVALID') log('native download: start refused', { code });
                    // Refused outright, so no terminal state will follow to clear a cancel sent meanwhile.
                    abandoned.delete(transferId);
                    finish(
                        transferId,
                        code === 'NOT_FOUND' ? { kind: 'unsupported' } : { kind: 'failed', reason: 'other' }
                    );
                    return;
                }
                // No answer (a timeout, while an OS prompt holds the shell up): it may have started after
                // all, so cancel it and acknowledge whatever state it ends in.
                log('native download: start unanswered', { code });
                giveUp(transferId, { kind: 'failed', reason: 'other' });
            });
        return { transferId, result, cancel: () => giveUp(transferId, { kind: 'cancelled' }) };
    };

    const sync = async () => {
        // Only downloads the shell accepted before the list was asked for can be judged missing.
        const acceptedBefore = [...waiters].filter(([, waiter]) => waiter.accepted).map(([id]) => id);
        let listed: OnFileTransferStatePayload[];
        try {
            const held = await bridge.request({ type: 'ListFileTransfers', data: {} });
            listed = held.data?.transfers ?? [];
        } catch {
            return;
        }
        const downloads = listed.filter(state => state.direction === 'download');
        const orphans: string[] = [];
        for (const state of downloads) {
            if (state.state === 'running') continue;
            // Ended and nobody here waits: a page before a reload started it. Its file is unused.
            if (!waiters.has(state.transferId) && !abandoned.has(state.transferId)) {
                orphans.push(state.transferId);
                continue;
            }
            onState(state);
        }
        const listedIds = new Set(downloads.map(state => state.transferId));
        for (const transferId of acceptedBefore) {
            if (!listedIds.has(transferId)) finish(transferId, { kind: 'failed', reason: 'system' });
        }
        await acknowledge(orphans);
    };

    return {
        start,
        acknowledge,
        sync,
        dispose: () => {
            unsubscribe();
            for (const [transferId] of waiters) finish(transferId, { kind: 'failed', reason: 'system' });
            abandoned.clear();
        },
    };
};

import type { DownloadedFile, OnFileTransferStatePayload } from '@chatic/bridge-messages';
import type { IWebBridgeClient } from '@chatic/bridges';

export type DownloadBridge = Pick<IWebBridgeClient, 'request' | 'onEvent'>;

export type DownloadResult =
    | { kind: 'file'; file: DownloadedFile }
    | { kind: 'responded'; httpStatus: number; providerCode?: string }
    | { kind: 'failed'; reason: 'network' | 'source' | 'system' | 'other' }
    | { kind: 'stalled' }
    | { kind: 'cancelled' };

export interface DownloadProgress {
    transferredBytes: number;
    totalBytes: number;
}

export interface NativeDownload {
    transferId: string;
    result: Promise<DownloadResult>;
    cancel(): void;
}

export interface StartDownloadInput {
    url: string;
    name?: string;
    title?: string;
    onProgress?: (progress: DownloadProgress) => void;
}

export interface NativeDownloads {
    start(input: StartDownloadInput): NativeDownload;
    acknowledge(transferIds: string[]): Promise<void>;
    sync(): Promise<void>;
    dispose(): void;
}

export interface NativeDownloadsOptions {
    bridge: DownloadBridge;
    newTransferId?: () => string;
    stallMs?: number;
    log?: (message: string, data?: Record<string, unknown>) => void;
}

export const DOWNLOAD_STALL_MS = 30_000;

const codeOf = (error: unknown) => (error as { code?: string } | null)?.code;

const isOk = (status: number | undefined) => status !== undefined && status >= 200 && status < 300;

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

export const createNativeDownloads = ({
    bridge,
    newTransferId = () => crypto.randomUUID(),
    stallMs = DOWNLOAD_STALL_MS,
    log = () => undefined,
}: NativeDownloadsOptions): NativeDownloads => {
    const waiters = new Map<string, Waiter>();
    const abandoned = new Set<string>();

    const acknowledge = async (transferIds: string[]) => {
        if (transferIds.length === 0) return;
        try {
            await bridge.request({ type: 'AckFileTransfers', data: { transferIds } });
        } catch (error) {
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
            log('native download: cancel refused', { code: codeOf(error) });
        });
    };

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
                armStall(transferId);
            })
            .catch(error => {
                const code = codeOf(error);
                if (code === 'NOT_FOUND' || code === 'INVALID') {
                    log('native download: start refused', { code });
                    abandoned.delete(transferId);
                    finish(transferId, { kind: 'failed', reason: 'other' });
                    return;
                }
                log('native download: start unanswered', { code });
                giveUp(transferId, { kind: 'failed', reason: 'other' });
            });
        return { transferId, result, cancel: () => giveUp(transferId, { kind: 'cancelled' }) };
    };

    const sync = async () => {
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

import type { MediaExportPermissionDetails, OnShareFilePayload } from '@chatic/bridge-messages';

import type { DownloadProgress, DownloadResult, NativeDownload } from '../../../runtime/transfer';

export type MediaExportAction = 'save' | 'share';

export type ExportMediaKind = 'image' | 'video';

export type MediaExportOutcome =
    | { kind: 'saved' }
    | { kind: 'shared' }
    | { kind: 'dismissed' }
    | { kind: 'permission'; canAskAgain: boolean }
    | { kind: 'unsupported-type' }
    | { kind: 'network' }
    | { kind: 'failed' }
    | { kind: 'cancelled' }
    | { kind: 'timed-out' };

export interface MediaExportDeps {
    download(input: { url: string; name?: string; onProgress?: (progress: DownloadProgress) => void }): NativeDownload;
    acknowledge(transferIds: string[]): Promise<void>;
    save(uri: string): Promise<unknown>;
    share(uri: string, title?: string): Promise<{ data?: OnShareFilePayload } | undefined>;
    freshUrl(): Promise<string | undefined>;
    log?(message: string, data?: Record<string, unknown>): void;
}

export interface MediaExportInput {
    action: MediaExportAction;
    kind?: ExportMediaKind;
    url: string;
    name?: string;
    signal?: AbortSignal;
    onProgress?: (progress: DownloadProgress) => void;
}

const codeOf = (error: unknown) => (error as { code?: string } | null)?.code;
const detailsOf = (error: unknown) =>
    (error as { details?: unknown } | null)?.details as MediaExportPermissionDetails | undefined;

const fromDownload = (result: Exclude<DownloadResult, { kind: 'file' }>): MediaExportOutcome => {
    switch (result.kind) {
        case 'cancelled':
            return { kind: 'cancelled' };
        case 'stalled':
            return { kind: 'network' };
        case 'failed':
            return result.reason === 'network' ? { kind: 'network' } : { kind: 'failed' };
        default:
            return { kind: 'failed' };
    }
};

const fromExportError = (error: unknown): MediaExportOutcome => {
    switch (codeOf(error)) {
        case 'PERMISSION_DENIED':
            return { kind: 'permission', canAskAgain: detailsOf(error)?.canAskAgain ?? false };
        case 'UNSUPPORTED_TYPE':
            return { kind: 'unsupported-type' };
        case 'TIMEOUT':
            return { kind: 'timed-out' };
        default:
            return { kind: 'failed' };
    }
};

export const exportMedia = async (input: MediaExportInput, deps: MediaExportDeps): Promise<MediaExportOutcome> => {
    const { action, name, signal, onProgress } = input;
    let url = input.url;
    let refreshed = false;
    let redownloaded = false;

    for (;;) {
        if (action === 'share' && signal?.aborted) return { kind: 'cancelled' };
        const download = deps.download({ url, name, onProgress });
        const abort = () => download.cancel();
        if (action === 'share') signal?.addEventListener('abort', abort, { once: true });
        let result: DownloadResult;
        try {
            result = await download.result;
        } finally {
            signal?.removeEventListener('abort', abort);
        }

        if (result.kind === 'responded' && result.httpStatus === 403 && !refreshed) {
            refreshed = true;
            const fresh = await deps.freshUrl().catch(() => undefined);
            if (fresh && fresh !== url) {
                url = fresh;
                continue;
            }
            return { kind: 'failed' };
        }
        if (result.kind !== 'file') return fromDownload(result);

        const { uri } = result.file;
        try {
            if (action === 'share' && signal?.aborted) return { kind: 'cancelled' };
            if (action === 'save') {
                await deps.save(uri);
                return { kind: 'saved' };
            }
            const reply = await deps.share(uri, name);
            return reply?.data?.completed ? { kind: 'shared' } : { kind: 'dismissed' };
        } catch (error) {
            if (codeOf(error) === 'SOURCE' && !redownloaded) {
                redownloaded = true;
                continue;
            }
            if (codeOf(error) === 'INVALID') deps.log?.('media export: the shell refused its own file', { action });
            return fromExportError(error);
        } finally {
            void deps.acknowledge([download.transferId]);
        }
    }
};

export interface SaveAllItem {
    url: string;
    name?: string;
    kind: ExportMediaKind;
}

export interface SaveAllResult {
    kind: ExportMediaKind;
    outcome: MediaExportOutcome;
}

export interface SaveAllProgress {
    current: number;
    total: number;
    fraction: number;
}

export type MediaExportDepsFor<T extends SaveAllItem> = (item: T) => MediaExportDeps;

const stopsTheRun = (outcome: MediaExportOutcome) => outcome.kind === 'permission';

export const saveAllMedia = async <T extends SaveAllItem>(
    items: readonly T[],
    depsFor: MediaExportDepsFor<T>,
    onProgress?: (progress: SaveAllProgress) => void,
    signal?: AbortSignal
): Promise<SaveAllResult[]> => {
    const results: SaveAllResult[] = [];
    const total = items.length;
    for (const [at, item] of items.entries()) {
        if (signal?.aborted) break;
        const current = at + 1;
        onProgress?.({ current, total, fraction: at / total });
        const outcome = await exportMedia(
            {
                action: 'save',
                kind: item.kind,
                url: item.url,
                name: item.name,
                onProgress: ({ transferredBytes, totalBytes }) => {
                    if (totalBytes <= 0) return;
                    onProgress?.({ current, total, fraction: (at + transferredBytes / totalBytes) / total });
                },
            },
            depsFor(item)
        );
        results.push({ kind: item.kind, outcome });
        if (stopsTheRun(outcome)) break;
    }
    return results;
};

export interface MediaExportToast {
    titleKey: string;
    values?: Record<string, number>;
    variant: 'default' | 'destructive';
    settings?: boolean;
}

export const toastFor = (outcome: MediaExportOutcome, kind: ExportMediaKind = 'image'): MediaExportToast | null => {
    const video = kind === 'video';
    switch (outcome.kind) {
        case 'saved':
            return {
                titleKey: video ? 'chat.attach.export.savedVideo' : 'chat.attach.export.saved',
                variant: 'default',
            };
        case 'permission':
            return { titleKey: 'chat.attach.export.permission', variant: 'destructive', settings: true };
        case 'unsupported-type':
            return { titleKey: 'chat.attach.export.unsupportedType', variant: 'destructive' };
        case 'network':
            return { titleKey: 'chat.attach.export.network', variant: 'destructive' };
        case 'failed':
            return {
                titleKey: video ? 'chat.attach.export.failedVideo' : 'chat.attach.export.failed',
                variant: 'destructive',
            };
        default:
            return null;
    }
};

export const toastForSaveAll = (results: readonly SaveAllResult[]): MediaExportToast | null => {
    const last = results.at(-1);
    if (last && stopsTheRun(last.outcome)) return toastFor(last.outcome, last.kind);
    const saved = results.filter(result => result.outcome.kind === 'saved').length;
    const photosOnly = results.every(result => result.kind === 'image');
    const failed = results.length - saved;
    if (saved > 0 && failed === 0) {
        return {
            titleKey: photosOnly ? 'chat.attach.export.savedAll' : 'chat.attach.export.savedAllItems',
            values: { n: saved },
            variant: 'default',
        };
    }
    if (saved > 0) {
        return {
            titleKey: photosOnly ? 'chat.attach.export.savedSome' : 'chat.attach.export.savedSomeItems',
            values: { saved, failed },
            variant: 'default',
        };
    }
    for (let i = results.length - 1; i >= 0; i--) {
        const shown = toastFor(results[i].outcome, results[i].kind);
        if (shown) return shown;
    }
    return null;
};

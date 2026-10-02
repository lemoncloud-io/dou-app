import type { MediaExportPermissionDetails, OnShareFilePayload } from '@chatic/app-messages';

import type { DownloadProgress, DownloadResult, NativeDownload } from '../../../runtime/transfer';

export type MediaExportAction = 'save' | 'share';

/** What is being saved or shared. A video differs only in how an older app refuses it. */
export type ExportMediaKind = 'image' | 'video';

/** How a save or share ended, which is all the button needs to pick a toast. */
export type MediaExportOutcome =
    | { kind: 'saved' }
    | { kind: 'shared' }
    /** The share sheet closed without a target, or Android cannot say. Not a failure. */
    | { kind: 'dismissed' }
    | { kind: 'permission'; canAskAgain: boolean }
    | { kind: 'unsupported-type' }
    | { kind: 'network' }
    | { kind: 'failed' }
    /** The installed app does not know the messages after all. */
    | { kind: 'update-required' }
    /** The installed app knows the messages but was built before videos: it refused this one. */
    | { kind: 'video-update-required' }
    /** Stopped on purpose — the viewer closed during a share. Silent. */
    | { kind: 'cancelled' }
    /** The shell never answered within the long wait. Silent: the button just comes back. */
    | { kind: 'timed-out' };

export interface MediaExportDeps {
    download(input: { url: string; name?: string; onProgress?: (progress: DownloadProgress) => void }): NativeDownload;
    acknowledge(transferIds: string[]): Promise<void>;
    save(uri: string): Promise<unknown>;
    share(uri: string, title?: string): Promise<{ data?: OnShareFilePayload } | undefined>;
    /** Reads the message again and returns this upload's fresh original address, if any. */
    freshUrl(): Promise<string | undefined>;
    /** The shell answered `NOT_FOUND`: hide save and share for the session. */
    withdraw(): void;
    /** An app built before videos refused one with `UNSUPPORTED_TYPE`: hide video export for the session. */
    withdrawVideos(): void;
    /** Reports what is a bug rather than a condition — the shell refusing a file it handed out. */
    log?(message: string, data?: Record<string, unknown>): void;
}

export interface MediaExportInput {
    action: MediaExportAction;
    /** Defaults to `'image'`. */
    kind?: ExportMediaKind;
    url: string;
    name?: string;
    /** Aborted when the viewer closes. Only a share listens: a save carries on. */
    signal?: AbortSignal;
    onProgress?: (progress: DownloadProgress) => void;
}

const codeOf = (error: unknown) => (error as { code?: string } | null)?.code;
const detailsOf = (error: unknown) =>
    (error as { details?: unknown } | null)?.details as MediaExportPermissionDetails | undefined;

/** What a download result means when it did not bring a file. */
const fromDownload = (result: Exclude<DownloadResult, { kind: 'file' }>): MediaExportOutcome => {
    switch (result.kind) {
        case 'unsupported':
            return { kind: 'update-required' };
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

/** What a failed save or share means. `SOURCE` is handled by the caller — it is worth one more download. */
const fromExportError = (error: unknown, kind: ExportMediaKind): MediaExportOutcome => {
    switch (codeOf(error)) {
        case 'NOT_FOUND':
            return { kind: 'update-required' };
        case 'PERMISSION_DENIED':
            return { kind: 'permission', canAskAgain: detailsOf(error)?.canAskAgain ?? false };
        case 'UNSUPPORTED_TYPE':
            // Videos widened two existing messages, so an app built before them still lists both in
            // its handshake and answers a video this way. The shell keeps this code for "this format"
            // alone, which is what lets it stand for "too old for videos" here.
            return kind === 'video' ? { kind: 'video-update-required' } : { kind: 'unsupported-type' };
        case 'TIMEOUT':
            return { kind: 'timed-out' };
        default:
            return { kind: 'failed' };
    }
};

/**
 * Saves or shares one chat photo or video: the shell downloads the original, then hands the file it
 * kept to the photo library or the share sheet. The shell never judges an HTTP status, so the
 * recoveries live here:
 *
 * - **403, once.** The signed address expired. The message is read again for the same upload's new
 *   original and the download runs once more; a second 403 is a failure.
 * - **`SOURCE` from the save or share, once.** The OS cleared the shell's cache between download and
 *   use, so the whole flow runs again from the download.
 *
 * The flow acknowledges only the downloads it started, each once its file has been used; one that
 * brought no file is acknowledged by the download registry at once.
 */
export const exportMedia = async (input: MediaExportInput, deps: MediaExportDeps): Promise<MediaExportOutcome> => {
    const { action, name, signal, onProgress } = input;
    const kind = input.kind ?? 'image';
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
        if (result.kind !== 'file') {
            const outcome = fromDownload(result);
            if (outcome.kind === 'update-required') deps.withdraw();
            return outcome;
        }

        const { uri } = result.file;
        try {
            // Closing the viewer while the file was coming must not throw a share sheet up afterwards.
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
            // The file came from the shell's own download, so the shell refusing it is a bug here or there.
            if (codeOf(error) === 'INVALID') deps.log?.('media export: the shell refused its own file', { action });
            const outcome = fromExportError(error, kind);
            if (outcome.kind === 'update-required') deps.withdraw();
            if (outcome.kind === 'video-update-required') deps.withdrawVideos();
            return outcome;
        } finally {
            void deps.acknowledge([download.transferId]);
        }
    }
};

/** One item of a "save all", by its address, the name it was sent under, and what it is. */
export interface SaveAllItem {
    url: string;
    name?: string;
    kind: ExportMediaKind;
}

/** How one item of a "save all" ended, with what it was — the toasts word a video differently. */
export interface SaveAllResult {
    kind: ExportMediaKind;
    outcome: MediaExportOutcome;
}

/** Where a "save all" is: the item being saved (1-based) of how many, and `0`..`1` across the run. */
export interface SaveAllProgress {
    current: number;
    total: number;
    fraction: number;
}

/** The dependencies for one item — its own fresh-address lookup, mainly. */
export type MediaExportDepsFor<T extends SaveAllItem> = (item: T) => MediaExportDeps;

/** Answers that would come back the same for every remaining item, so the run stops at them. */
const stopsTheRun = (outcome: MediaExportOutcome) =>
    outcome.kind === 'permission' || outcome.kind === 'update-required';

/**
 * Saves a message's photos and videos one after another, in the order given — never side by side, so
 * the first save's permission prompt appears once and the shell is not handed a burst of downloads.
 * Each item runs the whole flow above, its retries and its acknowledgement included.
 *
 * A refused permission or an app that does not know the message stops the run: every remaining item
 * would get the same answer. An app too old for videos refusing one skips the remaining videos and
 * keeps saving photos. Any other failure skips that item and goes on. An aborted `signal` — the
 * viewer closed — lets the current item finish and starts no other.
 */
export const saveAllMedia = async <T extends SaveAllItem>(
    items: readonly T[],
    depsFor: MediaExportDepsFor<T>,
    onProgress?: (progress: SaveAllProgress) => void,
    signal?: AbortSignal
): Promise<SaveAllResult[]> => {
    const results: SaveAllResult[] = [];
    const total = items.length;
    let videosRefused = false;
    for (const [at, item] of items.entries()) {
        if (signal?.aborted) break;
        if (videosRefused && item.kind === 'video') continue;
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
        if (outcome.kind === 'video-update-required') videosRefused = true;
    }
    return results;
};

/** The toast an outcome asks for, as translation keys. `null` means stay quiet. */
export interface MediaExportToast {
    titleKey: string;
    /** Interpolation values for the title. */
    values?: Record<string, number>;
    variant: 'default' | 'destructive';
    /** Offer the system settings, where a refused permission can be turned back on. */
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
        case 'update-required':
            return { titleKey: 'chat.attach.export.updateRequired', variant: 'default' };
        case 'video-update-required':
            return { titleKey: 'chat.attach.export.videoUpdateRequired', variant: 'default' };
        default:
            // A share reports nothing on success: the sheet itself was the feedback.
            return null;
    }
};

/**
 * The one toast that ends a "save all". A run that stopped speaks for the reason it stopped, even
 * after some were saved. A run in which an older app refused a video says how many photos it saved
 * and that videos need an update. Otherwise it says how many were saved — and how many failed, when
 * some did — or, when none was, speaks for the last failure that has something to say. A run of
 * photos only keeps the photo wording; one with a video in it counts items.
 */
export const toastForSaveAll = (results: readonly SaveAllResult[]): MediaExportToast | null => {
    const last = results.at(-1);
    if (last && stopsTheRun(last.outcome)) return toastFor(last.outcome, last.kind);
    const saved = results.filter(result => result.outcome.kind === 'saved').length;
    if (results.some(result => result.outcome.kind === 'video-update-required')) {
        return saved > 0
            ? { titleKey: 'chat.attach.export.savedPhotosVideosNeedUpdate', values: { n: saved }, variant: 'default' }
            : toastFor({ kind: 'video-update-required' });
    }
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

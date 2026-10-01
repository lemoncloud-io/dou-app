import type { MediaExportPermissionDetails, OnShareFilePayload } from '@chatic/app-messages';

import type { DownloadProgress, DownloadResult, NativeDownload } from '../../../runtime/transfer';

export type ImageExportAction = 'save' | 'share';

/** How a save or share ended, which is all the button needs to pick a toast. */
export type ImageExportOutcome =
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
    /** Stopped on purpose — the viewer closed during a share. Silent. */
    | { kind: 'cancelled' }
    /** The shell never answered within the long wait. Silent: the button just comes back. */
    | { kind: 'timed-out' };

export interface ImageExportDeps {
    download(input: { url: string; name?: string; onProgress?: (progress: DownloadProgress) => void }): NativeDownload;
    acknowledge(transferIds: string[]): Promise<void>;
    save(uri: string): Promise<unknown>;
    share(uri: string, title?: string): Promise<{ data?: OnShareFilePayload } | undefined>;
    /** Reads the message again and returns this upload's fresh original address, if any. */
    freshUrl(): Promise<string | undefined>;
    /** The shell answered `NOT_FOUND`: hide save and share for the session. */
    withdraw(): void;
    /** Reports what is a bug rather than a condition — the shell refusing a file it handed out. */
    log?(message: string, data?: Record<string, unknown>): void;
}

export interface ImageExportInput {
    action: ImageExportAction;
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
const fromDownload = (result: Exclude<DownloadResult, { kind: 'file' }>): ImageExportOutcome => {
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
const fromExportError = (error: unknown): ImageExportOutcome => {
    switch (codeOf(error)) {
        case 'NOT_FOUND':
            return { kind: 'update-required' };
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

/**
 * Saves or shares one chat image: the shell downloads the original, then hands the file it kept to
 * the photo library or the share sheet. The shell never judges an HTTP status, so the recoveries
 * live here:
 *
 * - **403, once.** The signed address expired. The message is read again for the same upload's new
 *   original and the download runs once more; a second 403 is a failure.
 * - **`SOURCE` from the save or share, once.** The OS cleared the shell's cache between download and
 *   use, so the whole flow runs again from the download.
 *
 * The flow acknowledges only the downloads it started, each once its file has been used; one that
 * brought no file is acknowledged by the download registry at once.
 */
export const exportImage = async (input: ImageExportInput, deps: ImageExportDeps): Promise<ImageExportOutcome> => {
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
            if (codeOf(error) === 'INVALID') deps.log?.('image export: the shell refused its own file', { action });
            const outcome = fromExportError(error);
            if (outcome.kind === 'update-required') deps.withdraw();
            return outcome;
        } finally {
            void deps.acknowledge([download.transferId]);
        }
    }
};

/** One image of a "save all", by its address and the name it was sent under. */
export interface SaveAllItem {
    url: string;
    name?: string;
}

/** The dependencies for one image — its own fresh-address lookup, mainly. */
export type ImageExportDepsFor<T extends SaveAllItem> = (item: T) => ImageExportDeps;

/** Answers that would come back the same for every remaining image, so the run stops at them. */
const stopsTheRun = (outcome: ImageExportOutcome) =>
    outcome.kind === 'permission' || outcome.kind === 'update-required';

/**
 * Saves a message's images one after another — never side by side, so the first save's permission
 * prompt appears once and the shell is not handed a burst of downloads. Each image runs the whole
 * flow above, its retries and its acknowledgement included.
 *
 * A refused permission or an app that does not know the message stops the run: every remaining
 * image would get the same answer. Any other failure skips that image and goes on.
 */
export const saveAllImages = async <T extends SaveAllItem>(
    items: readonly T[],
    depsFor: ImageExportDepsFor<T>,
    /** `0`..`1` across the whole run — the images done plus the share of the current download. */
    onProgress?: (progress: number) => void
): Promise<ImageExportOutcome[]> => {
    const outcomes: ImageExportOutcome[] = [];
    for (const item of items) {
        const done = outcomes.length;
        const outcome = await exportImage(
            {
                action: 'save',
                url: item.url,
                name: item.name,
                onProgress: ({ transferredBytes, totalBytes }) => {
                    if (totalBytes > 0) onProgress?.((done + transferredBytes / totalBytes) / items.length);
                },
            },
            depsFor(item)
        );
        outcomes.push(outcome);
        onProgress?.(outcomes.length / items.length);
        if (stopsTheRun(outcome)) break;
    }
    return outcomes;
};

/** The toast an outcome asks for, as translation keys. `null` means stay quiet. */
export interface ImageExportToast {
    titleKey: string;
    /** Interpolation values for the title. */
    values?: Record<string, number>;
    variant: 'default' | 'destructive';
    /** Offer the system settings, where a refused permission can be turned back on. */
    settings?: boolean;
}

export const toastFor = (outcome: ImageExportOutcome): ImageExportToast | null => {
    switch (outcome.kind) {
        case 'saved':
            return { titleKey: 'chat.attach.export.saved', variant: 'default' };
        case 'permission':
            return { titleKey: 'chat.attach.export.permission', variant: 'destructive', settings: true };
        case 'unsupported-type':
            return { titleKey: 'chat.attach.export.unsupportedType', variant: 'destructive' };
        case 'network':
            return { titleKey: 'chat.attach.export.network', variant: 'destructive' };
        case 'failed':
            return { titleKey: 'chat.attach.export.failed', variant: 'destructive' };
        case 'update-required':
            return { titleKey: 'chat.attach.export.updateRequired', variant: 'default' };
        default:
            // A share reports nothing on success: the sheet itself was the feedback.
            return null;
    }
};

/**
 * The one toast that ends a "save all". A run that stopped speaks for the reason it stopped, even
 * after some were saved. Otherwise it says how many were saved — all or some — or, when none was,
 * speaks for the last failure that has something to say.
 */
export const toastForSaveAll = (outcomes: readonly ImageExportOutcome[], total: number): ImageExportToast | null => {
    const last = outcomes.at(-1);
    if (last && stopsTheRun(last)) return toastFor(last);
    const saved = outcomes.filter(outcome => outcome.kind === 'saved').length;
    if (saved === total) return { titleKey: 'chat.attach.export.savedAll', values: { n: total }, variant: 'default' };
    if (saved > 0) return { titleKey: 'chat.attach.export.savedSome', values: { saved, total }, variant: 'default' };
    for (let i = outcomes.length - 1; i >= 0; i--) {
        const shown = toastFor(outcomes[i]);
        if (shown) return shown;
    }
    return null;
};

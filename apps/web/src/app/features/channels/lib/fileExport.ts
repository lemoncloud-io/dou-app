import type { OnSaveFilePayload } from '@chatic/app-messages';

import type { DownloadProgress, DownloadResult, NativeDownload } from '../../../runtime/transfer';

/** What a document card asks of the shell once the file is on the device. */
export type FileUse = 'open' | 'save' | 'share';

/** How one open, save or share ended — all the hook needs to pick a toast and the card's state. */
export type FileExportOutcome =
    | { kind: 'opened' }
    /** The share sheet was shown — asked for, or offered because nothing on the device opens the format. */
    | { kind: 'shared' }
    | { kind: 'saved'; location: string }
    /** The iOS export sheet was dismissed. Not a failure, and nothing to say. */
    | { kind: 'save-dismissed' }
    /** Android 7–9 refused the storage permission `SaveFile` asks for. */
    | { kind: 'permission' }
    /** The app has no `OpenFile` / `SaveFile` (or no downloads at all): the card shows its update notice. */
    | { kind: 'update-required' }
    /** `ShareFile` refused a document — an app built before documents. */
    | { kind: 'share-update-required' }
    /** Stopped on purpose while downloading. Silent. */
    | { kind: 'cancelled' }
    /** The shell never answered within the long wait. Silent. */
    | { kind: 'timed-out' }
    | { kind: 'failed' };

export interface FileExportDeps {
    download(input: { url: string; name?: string; onProgress?: (progress: DownloadProgress) => void }): NativeDownload;
    acknowledge(transferIds: string[]): Promise<void>;
    open(uri: string): Promise<unknown>;
    save(uri: string, name: string): Promise<{ data?: OnSaveFilePayload } | undefined>;
    share(uri: string, title?: string): Promise<unknown>;
    /** Reads the message again and returns this upload's fresh address, if any. */
    freshUrl(): Promise<string | undefined>;
    /** The `file://` URI an earlier download of this file left this session, if any. */
    kept(): string | undefined;
    /** Remembers the downloaded file for the session, so the next use skips the download. */
    keep(uri: string): void;
    /** The OS cleared the kept file. */
    forget(): void;
    /** Reports what is a bug rather than a condition — the shell refusing a file it handed out. */
    log?(message: string, data?: Record<string, unknown>): void;
}

export interface FileExportInput {
    use: FileUse;
    url: string;
    /** The upload's own name: what `SaveFile` keeps it under and what the share sheet is titled. */
    name: string;
    /** Aborting it cancels the download. Once the file is here, the use carries on. */
    signal?: AbortSignal;
    onProgress?: (progress: DownloadProgress) => void;
}

const codeOf = (error: unknown) => (error as { code?: string } | null)?.code;

/** A failure while a step runs, tagged with the step: the same code means different things per message. */
class StepError extends Error {
    constructor(
        readonly step: FileUse,
        readonly cause: unknown
    ) {
        super(`file ${step} failed`);
    }
}

const fromDownload = (result: Exclude<DownloadResult, { kind: 'file' }>): FileExportOutcome => {
    switch (result.kind) {
        case 'unsupported':
            return { kind: 'update-required' };
        case 'cancelled':
            return { kind: 'cancelled' };
        default:
            return { kind: 'failed' };
    }
};

const fromStepError = ({ step, cause }: StepError): FileExportOutcome => {
    switch (codeOf(cause)) {
        case 'NOT_FOUND':
            // `ShareFile` is offered only when the handshake lists it, so its `NOT_FOUND` is a plain failure.
            return step === 'share' ? { kind: 'failed' } : { kind: 'update-required' };
        case 'PERMISSION_DENIED':
            return step === 'save' ? { kind: 'permission' } : { kind: 'failed' };
        case 'UNSUPPORTED_TYPE':
            return step === 'share' ? { kind: 'share-update-required' } : { kind: 'failed' };
        case 'TIMEOUT':
            return { kind: 'timed-out' };
        default:
            return { kind: 'failed' };
    }
};

const run = async (step: FileUse, call: () => Promise<unknown>): Promise<unknown> => {
    try {
        return await call();
    } catch (error) {
        throw new StepError(step, error);
    }
};

/** Hands the file on the device to the OS surface the use asks for. */
const handOver = async (use: FileUse, uri: string, name: string, deps: FileExportDeps): Promise<FileExportOutcome> => {
    if (use === 'save') {
        const reply = (await run('save', () => deps.save(uri, name))) as { data?: OnSaveFilePayload } | undefined;
        return reply?.data?.saved ? { kind: 'saved', location: reply.data.location } : { kind: 'save-dismissed' };
    }
    if (use === 'open') {
        try {
            await run('open', () => deps.open(uri));
            return { kind: 'opened' };
        } catch (error) {
            // Nothing on the device shows this format (an HWP, usually): the share sheet can still hand
            // it to an app that takes it.
            if (!(error instanceof StepError) || codeOf(error.cause) !== 'NO_HANDLER') throw error;
        }
    }
    await run('share', () => deps.share(uri, name));
    return { kind: 'shared' };
};

/**
 * Opens, saves or shares one chat document inside the app: the shell downloads it once, the URI it
 * kept is remembered for the session, and every later use hands that same file over. The shell
 * never judges an HTTP status, so the recoveries live here:
 *
 * - **403, once.** The signed address expired. The message is read again for the upload's new
 *   address and the download runs once more; a second 403 is a failure.
 * - **`SOURCE` from the use, once.** The OS cleared the file — the kept one or a fresh one — so it is
 *   forgotten and the flow runs again from the download.
 * - **`NO_HANDLER` from an open.** Nothing on the device opens the format; the share sheet is offered.
 *
 * A download this flow started is acknowledged once its file has been used. Acknowledging drops only
 * the shell's record, never the file, so the kept URI stays good.
 */
export const exportFile = async (input: FileExportInput, deps: FileExportDeps): Promise<FileExportOutcome> => {
    const { use, name, signal, onProgress } = input;
    let url = input.url;
    let refreshed = false;
    let redownloaded = false;

    for (;;) {
        let uri = deps.kept();
        let transferId: string | undefined;
        if (!uri) {
            if (signal?.aborted) return { kind: 'cancelled' };
            const download = deps.download({ url, name, onProgress });
            const abort = () => download.cancel();
            signal?.addEventListener('abort', abort, { once: true });
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
            uri = result.file.uri;
            transferId = download.transferId;
            deps.keep(uri);
        }

        try {
            return await handOver(use, uri, name, deps);
        } catch (error) {
            if (!(error instanceof StepError)) throw error;
            if (codeOf(error.cause) === 'SOURCE') {
                deps.forget();
                if (!redownloaded) {
                    redownloaded = true;
                    continue;
                }
            }
            if (codeOf(error.cause) === 'INVALID') deps.log?.('file export: the shell refused its own file', { use });
            return fromStepError(error);
        } finally {
            if (transferId) void deps.acknowledge([transferId]);
        }
    }
};

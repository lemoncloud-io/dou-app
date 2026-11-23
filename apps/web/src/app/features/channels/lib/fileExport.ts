import type { OnSaveFilePayload } from '@chatic/bridge-messages';
import { chatAttachmentFormat } from '@chatic/runtime';

import type { DownloadProgress, DownloadResult, NativeDownload } from '../../../runtime/transfer';

export type FileUse = 'open' | 'save' | 'share';

export type FileExportOutcome =
    | { kind: 'opened' }
    | { kind: 'shared' }
    | { kind: 'saved'; location: string }
    | { kind: 'save-dismissed' }
    | { kind: 'permission' }
    | { kind: 'save-update-required' }
    | { kind: 'cancelled' }
    | { kind: 'timed-out' }
    | { kind: 'failed' };

export interface FileExportDeps {
    download(input: { url: string; name?: string; onProgress?: (progress: DownloadProgress) => void }): NativeDownload;
    acknowledge(transferIds: string[]): Promise<void>;
    open(uri: string): Promise<unknown>;
    save(uri: string, name: string): Promise<{ data?: OnSaveFilePayload } | undefined>;
    share(uri: string, title?: string): Promise<unknown>;
    freshUrl(): Promise<string | undefined>;
    kept(): string | undefined;
    keep(uri: string): void;
    forget(): void;
    log?(message: string, data?: Record<string, unknown>): void;
}

export interface FileExportInput {
    use: FileUse;
    url: string;
    name: string;
    signal?: AbortSignal;
    onProgress?: (progress: DownloadProgress) => void;
}

const codeOf = (error: unknown) => (error as { code?: string } | null)?.code;

class StepError extends Error {
    constructor(
        readonly step: FileUse,
        readonly cause: unknown
    ) {
        super(`file ${step} failed`);
    }
}

const fromDownload = (result: Exclude<DownloadResult, { kind: 'file' }>): FileExportOutcome => {
    return result.kind === 'cancelled' ? { kind: 'cancelled' } : { kind: 'failed' };
};

const fromStepError = ({ step, cause }: StepError): FileExportOutcome => {
    switch (codeOf(cause)) {
        case 'PERMISSION_DENIED':
            return step === 'save' ? { kind: 'permission' } : { kind: 'failed' };
        case 'TIMEOUT':
            return { kind: 'timed-out' };
        default:
            return { kind: 'failed' };
    }
};

const isNewlySavedFormat = (name: string): boolean =>
    !!chatAttachmentFormat({ name, type: '' })?.type.startsWith('audio/');

const run = async (step: FileUse, call: () => Promise<unknown>): Promise<unknown> => {
    try {
        return await call();
    } catch (error) {
        throw new StepError(step, error);
    }
};

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
            if (!(error instanceof StepError) || codeOf(error.cause) !== 'NO_HANDLER') throw error;
        }
    }
    await run('share', () => deps.share(uri, name));
    return { kind: 'shared' };
};

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
            if (codeOf(error.cause) === 'INVALID') {
                if (error.step === 'save' && isNewlySavedFormat(name)) return { kind: 'save-update-required' };
                deps.log?.('file export: the shell refused its own file', { use });
            }
            return fromStepError(error);
        } finally {
            if (transferId) void deps.acknowledge([transferId]);
        }
    }
};

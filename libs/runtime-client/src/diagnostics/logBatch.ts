import { toWireLogBatch } from '@chatic/logger';

import { runtimeData } from '../data/dataCommands';

import type { LogEntry, UploadOutcome } from '@chatic/logger';

const readStatus = (error: unknown): number | undefined => {
    const err = error as { status?: unknown; response?: { status?: unknown }; statusCode?: unknown };
    const status = err?.status ?? err?.response?.status ?? err?.statusCode;
    return typeof status === 'number' ? status : undefined;
};

const AUTH_STATUSES = new Set([401, 403]);

const classify = (error: unknown): UploadOutcome => {
    const status = readStatus(error);
    if (status !== undefined && AUTH_STATUSES.has(status)) return 'retry';
    if (status !== undefined && status >= 400 && status < 500) return 'discard';
    return 'retry';
};

export const uploadLogBatch = async (entries: LogEntry[]): Promise<UploadOutcome> => {
    if (!entries.length) return 'ok';

    try {
        await runtimeData().repositories().report.uploadLogBatch(toWireLogBatch(entries));

        return 'ok';
    } catch (error) {
        const outcome = classify(error);

        console.warn('[logBatch] upload failed', { outcome, status: readStatus(error) });
        return outcome;
    }
};

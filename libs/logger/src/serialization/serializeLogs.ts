import { safeStringify } from './safeStringify';
import { truncateText } from './truncateText';

import type { LogEntry } from '../core/types';

/**
 * A log entry flattened into a plain, JSON-safe shape for report payloads
 * (issue reports and error reports). `data`/`error` are pre-stringified (and
 * truncated) so the final `JSON.stringify` at the transport layer never chokes
 * on circular refs or throws.
 */
export interface SerializedLog {
    level: string;
    tag: string;
    message: string;
    timestamp: number;
    /** Origin runtime when the entry crossed a boundary (ADR-0047). */
    source?: string;
    data?: string;
    error?: string;
}

/** Max serialized chars kept for a single message/data/error field. */
export const PER_FIELD_CHAR_LIMIT = 2_000;
/** Max total serialized chars across all included logs (payload-size guard). */
export const TOTAL_CHAR_BUDGET = 40_000;

/**
 * Flatten log entries for transport, truncating each field and staying within
 * `TOTAL_CHAR_BUDGET`. Pass entries oldest→newest; when the budget is exceeded
 * the OLDEST entries are dropped (the newest logs — closest to the reported
 * event — are the most useful, so they are kept). Output stays chronological.
 */
export const serializeLogs = (entries: LogEntry[]): SerializedLog[] => {
    const out: SerializedLog[] = [];
    let remaining = TOTAL_CHAR_BUDGET;

    // Walk newest→oldest so the budget is spent on the most recent entries first.
    for (let i = entries.length - 1; i >= 0; i -= 1) {
        const entry = entries[i];
        const dataStr = safeStringify(entry.data);
        const errorStr = safeStringify(entry.error);

        const item: SerializedLog = {
            level: entry.level,
            tag: entry.tag,
            message: truncateText(entry.message ?? '', PER_FIELD_CHAR_LIMIT),
            timestamp: entry.timestamp,
            ...(entry.source ? { source: entry.source } : {}),
            ...(dataStr !== undefined ? { data: truncateText(dataStr, PER_FIELD_CHAR_LIMIT) } : {}),
            ...(errorStr !== undefined ? { error: truncateText(errorStr, PER_FIELD_CHAR_LIMIT) } : {}),
        };

        const size = item.message.length + (item.data?.length ?? 0) + (item.error?.length ?? 0);
        if (size > remaining) break; // budget exhausted — drop the remaining (older) entries
        remaining -= size;
        out.push(item);
    }

    return out.reverse(); // restore chronological (oldest→newest) order
};

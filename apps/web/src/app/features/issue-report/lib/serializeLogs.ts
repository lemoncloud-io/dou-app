import type { LogEntry } from '@chatic/bridges';

/**
 * A log entry flattened into a plain, JSON-safe shape for the issue-report
 * payload. `data`/`error` are pre-stringified (and truncated) so the final
 * `JSON.stringify` in `reportIssue` never chokes on circular refs or throws.
 */
export interface SerializedLog {
    level: string;
    tag: string;
    message: string;
    timestamp: number;
    data?: string;
    error?: string;
}

/** Max serialized chars kept for a single message/data/error field. */
export const PER_FIELD_CHAR_LIMIT = 2_000;
/** Max total serialized chars across all included logs (payload-size guard). */
export const TOTAL_CHAR_BUDGET = 40_000;

const truncate = (value: string, max: number): string =>
    value.length > max ? `${value.slice(0, max)}…(+${value.length - max})` : value;

/**
 * Stringify an arbitrary log field defensively: circular references become
 * `[Circular]`, Errors expand to name/message/stack, and anything that still
 * throws falls back to `String()`. Returns undefined for nullish input so the
 * field can be omitted entirely.
 *
 * Note: values are NOT redacted (per ADR-0017 the v1 report attaches logs
 * as-is). `redactSensitive` from `@chatic/bridges` is available if that
 * decision is revisited.
 */
export const safeStringify = (value: unknown): string | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') return value;
    try {
        const seen = new WeakSet<object>();
        return JSON.stringify(value, (_key, val) => {
            if (val instanceof Error) {
                return { name: val.name, message: val.message, stack: val.stack };
            }
            if (typeof val === 'object' && val !== null) {
                if (seen.has(val)) return '[Circular]';
                seen.add(val);
            }
            return val;
        });
    } catch {
        try {
            return String(value);
        } catch {
            return '[Unserializable]';
        }
    }
};

/**
 * Flatten log entries for transport, truncating each field and staying within
 * `TOTAL_CHAR_BUDGET`. Pass entries oldest→newest; when the budget is exceeded
 * the OLDEST entries are dropped (the newest logs — closest to the reported
 * issue — are the most useful, so they are kept). Output stays chronological.
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
            message: truncate(entry.message ?? '', PER_FIELD_CHAR_LIMIT),
            timestamp: entry.timestamp,
            ...(dataStr !== undefined ? { data: truncate(dataStr, PER_FIELD_CHAR_LIMIT) } : {}),
            ...(errorStr !== undefined ? { error: truncate(errorStr, PER_FIELD_CHAR_LIMIT) } : {}),
        };

        const size = item.message.length + (item.data?.length ?? 0) + (item.error?.length ?? 0);
        if (size > remaining) break; // budget exhausted — drop the remaining (older) entries
        remaining -= size;
        out.push(item);
    }

    return out.reverse(); // restore chronological (oldest→newest) order
};

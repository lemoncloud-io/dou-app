import { isSensitiveKey, redactMaybeJson, REDACTED } from './redact';
import type { LogEntry } from './types';

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

const truncate = (value: string, max: number): string =>
    value.length > max ? `${value.slice(0, max)}…(+${value.length - max})` : value;

/**
 * Stringify an arbitrary log field defensively: circular references become
 * `[Circular]`, Errors expand to name/message/stack, and anything that still
 * throws falls back to `String()`. Returns undefined for nullish input so the
 * field can be omitted entirely.
 *
 * Secret-bearing fields are masked by name (`SENSITIVE_KEYS`), the same list
 * the transport's network logging already applies to request bodies. String
 * values that are themselves serialized JSON are masked *inside* too: axios
 * stringifies a request body before the call fails, so the failed request's
 * `config.data` reaches here as one opaque string and key-based masking alone
 * would see only the key `data` and let its contents through. ADR-0017
 * shipped v1 without this on the grounds that a report is read by the team;
 * ADR-0047 widened where these entries end up — a shared Slack channel, and now
 * sessionStorage/MMKV on the device — so the exemption no longer holds. Masking
 * happens inside the replacer so it reaches nested objects and array elements;
 * a bare string cannot be judged and passes through.
 */
export const safeStringify = (value: unknown): string | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') return value;
    try {
        const seen = new WeakSet<object>();
        return JSON.stringify(value, (key, val) => {
            // Before the Error branch: a secret held under a sensitive key is
            // masked whatever its type.
            if (key && isSensitiveKey(key)) return REDACTED;
            // Parsed JSON is acyclic, so this cannot reintroduce the cycle the
            // WeakSet below guards against.
            if (typeof val === 'string') return redactMaybeJson(val);
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
            message: truncate(entry.message ?? '', PER_FIELD_CHAR_LIMIT),
            timestamp: entry.timestamp,
            ...(entry.source ? { source: entry.source } : {}),
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

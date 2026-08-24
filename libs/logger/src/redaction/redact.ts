import { isSensitiveKey, REDACTED } from './sensitiveKeys';

/**
 * Value-level masking and size capping — the transforms every log-bearing
 * payload runs through before it is persisted, bridged or sent.
 *
 * Plain functions rather than a class on purpose: they hold no state, and a
 * class of statics would only add ceremony. The policy they enforce lives next
 * door in `sensitiveKeys.ts`.
 */

/** Upper bound (in serialized chars) for a single request/response body. */
export const MAX_BODY_BYTES = 2048;

/**
 * Returns a deep copy of `value` with sensitive field values replaced by
 * `[REDACTED]`. The original input is never mutated. Non-plain values (strings,
 * numbers, etc.) are returned as-is.
 */
export const redactSensitive = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(item => redactSensitive(item));
    }

    if (value && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            result[key] = isSensitiveKey(key) ? REDACTED : redactSensitive(item);
        }
        return result;
    }

    return value;
};

/**
 * Redacts a request/response body that may already be a serialized JSON string.
 * Axios stringifies `config.data` before sending, so field-level masking would
 * otherwise miss secrets embedded in that string. Parses JSON objects/arrays
 * and masks them; leaves non-JSON strings and other values to `redactSensitive`.
 */
export const redactMaybeJson = (value: unknown): unknown => {
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object') return redactSensitive(parsed);
        } catch {
            // Not JSON — fall through and return the raw string unchanged.
        }
        return value;
    }
    return redactSensitive(value);
};

/**
 * Serializes `value` and truncates it when it exceeds `MAX_BODY_BYTES`, so a
 * single oversized payload cannot flood the log buffer or the native bridge.
 * Returns `undefined` for empty input so the field is omitted from the entry.
 */
export const truncate = (value: unknown): unknown => {
    if (value === undefined || value === null) return undefined;

    let serialized: string;
    try {
        serialized = JSON.stringify(value);
    } catch {
        serialized = String(value);
    }

    if (serialized === undefined) return undefined;
    if (serialized.length <= MAX_BODY_BYTES) return value;

    return `${serialized.slice(0, MAX_BODY_BYTES)}…[truncated]`;
};

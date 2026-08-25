import { isSensitiveKey, REDACTED } from '../redaction/sensitiveKeys';
import { redactMaybeJson } from '../redaction/redact';

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

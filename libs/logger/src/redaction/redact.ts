import {
    emailPlaceholder,
    placeholderKindOf,
    phonePlaceholder,
    redactionSaltFor,
    tokenPlaceholder,
    type RedactOptions,
} from './fingerprint';
import { isSensitiveField, REDACTED, sensitiveFamilyOf } from './sensitiveKeys';
import { isEmailShaped, isJwtShaped, redactText } from './valuePatterns';

/**
 * Value-level masking and size capping — the transforms every log-bearing
 * payload runs through before it is persisted, bridged or sent.
 *
 * Plain functions rather than a class on purpose: they hold no state, and a
 * class of statics would only add ceremony. The policy they enforce lives next
 * door in `sensitiveKeys.ts` (by name) and `valuePatterns.ts` (by shape).
 */

/** Upper bound (in serialized chars) for a single request/response body. */
export const MAX_BODY_BYTES = 2048;

/**
 * Below this, a value under a token name gets no fingerprint. Every real token is far longer; a short
 * value there is something else wearing the name — a code, a nonce — and short is exactly what a
 * fingerprint must not be taken of.
 */
const MIN_FINGERPRINTED_TOKEN_LENGTH = 16;

/**
 * A phone number's digit count that may be shown in part: nine or more, so the four shown are fewer
 * than half; at most E.164's fifteen. A shorter value under a phone name is `[REDACTED]`.
 */
const PHONE_DIGITS = /^\d{9,15}$/;

/** The placeholder kinds each family prints; a placeholder of another kind under the name is not kept. */
const FAMILY_KINDS: Record<string, readonly string[]> = {
    token: ['REDACTED', 'JWT', 'TOKEN'],
    email: ['REDACTED', 'EMAIL'],
    phone: ['REDACTED', 'PHONE'],
};

/**
 * What replaces a value held under a sensitive name — the name-based twin of the shape rules'
 * placeholders.
 *
 * `[REDACTED]` unless the device's salt is set and the name's family allows more
 * (`sensitiveFamilyOf`): a token keeps a fingerprint (`[TOKEN#b07e22]`, `[JWT#…]` for a JWT), a phone
 * number its last four digits, an address its domain — the same forms the shape rules print, so one
 * value reads alike wherever it was found. A value that does not look like what its name promises
 * (an `email` holding no address) is `[REDACTED]`: a partial display of the wrong thing could be
 * anything. A value that is already a placeholder of the name's own family is kept as it is.
 */
export const maskSensitiveValue = (key: string, value: unknown, options?: RedactOptions): string => {
    const salt = redactionSaltFor(options);
    if (!salt) return REDACTED;
    const family = sensitiveFamilyOf(key);
    // Masked already, by a layer that wrote the entry (the HTTP logger masks bodies as it logs them).
    // Its placeholder no longer looks like an address or a token, so judging it again would lose it —
    // but only a placeholder this name's family prints is kept, so nothing can pass as one.
    const kind = placeholderKindOf(value);
    if (kind && family && FAMILY_KINDS[family].includes(kind)) return value as string;

    switch (family) {
        case 'token':
            if (typeof value !== 'string' || value.length < MIN_FINGERPRINTED_TOKEN_LENGTH) return REDACTED;
            return tokenPlaceholder(isJwtShaped(value) ? 'JWT' : 'TOKEN', value, salt);
        case 'email': {
            const address = typeof value === 'string' ? value.trim() : '';
            return isEmailShaped(address) ? emailPlaceholder(address, salt) : REDACTED;
        }
        case 'phone': {
            const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
            return PHONE_DIGITS.test(text.replace(/[\s().+-]/g, '')) ? phonePlaceholder(text, salt) : REDACTED;
        }
        default:
            return REDACTED;
    }
};

/**
 * Returns a deep copy of `value` with sensitive field values replaced by
 * `[REDACTED]` (or a detailed placeholder — {@link maskSensitiveValue}). The
 * original input is never mutated.
 *
 * Strings are additionally masked by shape (`redactText`), which is what covers
 * a secret sitting under a key that says nothing about it — a server's `detail`
 * text, a `reason`, a url with a token in it. Name-based masking alone can only
 * act on fields it was told about.
 */
export const redactSensitive = (value: unknown, options?: RedactOptions): unknown => {
    if (typeof value === 'string') {
        return redactText(value, options);
    }

    if (Array.isArray(value)) {
        return value.map(item => redactSensitive(item, options));
    }

    if (value && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            result[key] = isSensitiveField(key, item, options)
                ? maskSensitiveValue(key, item, options)
                : redactSensitive(item, options);
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
export const redactMaybeJson = (value: unknown, options?: RedactOptions): unknown => {
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object') return redactSensitive(parsed, options);
        } catch {
            // Not JSON — fall through to shape-based masking of the raw string.
        }
        return redactText(value, options);
    }
    return redactSensitive(value, options);
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

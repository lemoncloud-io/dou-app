import {
    emailPlaceholder,
    placeholderKindOf,
    phonePlaceholder,
    isDetailed,
    MIN_FINGERPRINTED_TOKEN_LENGTH,
    tokenPlaceholder,
    withoutCutPlaceholder,
    type RedactOptions,
} from './fingerprint';
import { isSensitiveField, REDACTED, sensitiveFamilyOf } from './sensitiveKeys';
import { isEmailShaped, isJwtShaped, redactText } from './valuePatterns';

export const MAX_BODY_BYTES = 2048;

const PHONE_DIGITS = /^\d{9,15}$/;

const FAMILY_KINDS: Record<string, readonly string[]> = {
    token: ['REDACTED', 'JWT', 'TOKEN'],
    email: ['REDACTED', 'EMAIL'],
    phone: ['REDACTED', 'PHONE'],
};

export const maskSensitiveValue = (key: string, value: unknown, options?: RedactOptions): string => {
    if (!isDetailed(options)) return REDACTED;
    const family = sensitiveFamilyOf(key);
    const kind = placeholderKindOf(value);
    if (kind && family && FAMILY_KINDS[family].includes(kind)) return value as string;

    switch (family) {
        case 'token':
            if (typeof value !== 'string' || value.length < MIN_FINGERPRINTED_TOKEN_LENGTH) return REDACTED;
            return tokenPlaceholder(isJwtShaped(value) ? 'JWT' : 'TOKEN', value, true);
        case 'email': {
            const address = typeof value === 'string' ? value.trim() : '';
            return isEmailShaped(address) ? emailPlaceholder(address, true) : REDACTED;
        }
        case 'phone': {
            const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
            return PHONE_DIGITS.test(text.replace(/[\s().+-]/g, '')) ? phonePlaceholder(text, true) : REDACTED;
        }
        default:
            return REDACTED;
    }
};

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

    return `${withoutCutPlaceholder(serialized.slice(0, MAX_BODY_BYTES))}…[truncated]`;
};

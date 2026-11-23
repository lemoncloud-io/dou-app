import { isSensitiveField } from '../redaction/sensitiveKeys';
import { maskSensitiveValue, redactMaybeJson } from '../redaction/redact';
import { redactText } from '../redaction/valuePatterns';

import type { RedactOptions } from '../redaction/fingerprint';

export const safeStringify = (value: unknown, options?: RedactOptions): string | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') return redactText(value, options);
    try {
        const seen = new WeakSet<object>();
        return JSON.stringify(value, (key, val) => {
            if (key && isSensitiveField(key, val, options)) return maskSensitiveValue(key, val, options);
            if (typeof val === 'string') return redactMaybeJson(val, options);
            if (val instanceof Error) {
                return {
                    name: val.name,
                    message: redactText(val.message, options),
                    stack: val.stack === undefined ? undefined : redactText(val.stack, options),
                };
            }
            if (typeof val === 'object' && val !== null) {
                if (seen.has(val)) return '[Circular]';
                seen.add(val);
            }
            return val;
        });
    } catch {
        try {
            return redactText(String(value), options);
        } catch {
            return '[Unserializable]';
        }
    }
};

import { MAX_BODY_BYTES, redactMaybeJson, redactSensitive, truncate } from './redact';

describe('redactSensitive', () => {
    it('masks sensitive top-level keys and preserves the rest', () => {
        const input = { username: 'alice', password: 'secret', token: 'abc' };
        expect(redactSensitive(input)).toEqual({ username: 'alice', password: '[REDACTED]', token: '[REDACTED]' });
    });

    it('masks case-insensitively and nested keys', () => {
        const input = { user: { Authorization: 'Bearer x', name: 'bob' }, identityToken: 'y' };
        expect(redactSensitive(input)).toEqual({
            user: { Authorization: '[REDACTED]', name: 'bob' },
            identityToken: '[REDACTED]',
        });
    });

    it('masks sensitive keys inside arrays', () => {
        const input = { items: [{ accessKey: 'k', label: 'ok' }] };
        expect(redactSensitive(input)).toEqual({ items: [{ accessKey: '[REDACTED]', label: 'ok' }] });
    });

    it('does not mutate the original input', () => {
        const input = { password: 'secret' };
        redactSensitive(input);
        expect(input.password).toBe('secret');
    });

    it('returns primitives unchanged', () => {
        expect(redactSensitive('plain')).toBe('plain');
        expect(redactSensitive(42)).toBe(42);
    });
});

describe('redactMaybeJson', () => {
    it('parses a serialized JSON body and masks sensitive fields', () => {
        const serialized = JSON.stringify({ id: 'u1', password: 'secret', identityToken: 'tok' });
        expect(redactMaybeJson(serialized)).toEqual({ id: 'u1', password: '[REDACTED]', identityToken: '[REDACTED]' });
    });

    it('leaves non-JSON strings unchanged', () => {
        expect(redactMaybeJson('just-a-string')).toBe('just-a-string');
    });

    it('masks plain objects like redactSensitive', () => {
        expect(redactMaybeJson({ token: 'x', keep: 1 })).toEqual({ token: '[REDACTED]', keep: 1 });
    });
});

describe('truncate', () => {
    it('returns undefined for empty input', () => {
        expect(truncate(undefined)).toBeUndefined();
        expect(truncate(null)).toBeUndefined();
    });

    it('keeps values within the limit intact', () => {
        const small = { a: 1 };
        expect(truncate(small)).toBe(small);
    });

    it('truncates oversized values with a marker', () => {
        const big = { blob: 'x'.repeat(MAX_BODY_BYTES + 100) };
        const result = truncate(big);
        expect(typeof result).toBe('string');
        expect(result as string).toContain('…[truncated]');
        expect((result as string).length).toBeLessThan(MAX_BODY_BYTES + 20);
    });
});

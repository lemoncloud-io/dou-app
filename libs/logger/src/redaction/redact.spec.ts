import { createHash } from 'crypto';

import { MAX_BODY_BYTES, maskSensitiveValue, redactMaybeJson, redactSensitive, truncate } from './redact';

const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 6);

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

describe('maskSensitiveValue', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const deviceToken = 'fMxZ1s9k:APA91bHqRs0dQxT7vWnLpYzB3cKmJ4eR5uG';

    describe('in detail', () => {
        it('fingerprints a token-family value, naming a JWT as one', () => {
            expect(maskSensitiveValue('deviceToken', deviceToken)).toBe(`[TOKEN#${fingerprint(deviceToken)}]`);
            expect(maskSensitiveValue('delegationToken', 'dlg-0123456789abcdef')).toBe(
                `[TOKEN#${fingerprint('dlg-0123456789abcdef')}]`
            );
            expect(maskSensitiveValue('identityToken', jwt)).toBe(`[JWT#${fingerprint(jwt)}]`);
        });

        it('gives a short value under a token name no fingerprint', () => {
            expect(maskSensitiveValue('token', 'abc')).toBe('[REDACTED]');
        });

        it('keeps passwords, one-time codes and secrets without a fingerprint', () => {
            for (const key of ['password', 'otp', 'code', 'secret', 'passwordResetToken', 'authorization']) {
                expect(maskSensitiveValue(key, 'a-long-enough-value-0123456789')).toBe('[REDACTED]');
            }
        });

        it('shows part of a phone number or an address held under its name', () => {
            expect(maskSensitiveValue('phoneNumber', '010-1234-5678')).toBe('[PHONE:…5678]');
            expect(maskSensitiveValue('email', ' someone@gmail.com ')).toBe('[EMAIL:@gmail.com]');
            expect(maskSensitiveValue('email', 'someone@user.test')).toBe('[EMAIL]');
        });

        it('is [REDACTED] when the value is not what the name promises', () => {
            expect(maskSensitiveValue('email', 'not an address')).toBe('[REDACTED]');
            expect(maskSensitiveValue('phone', '12')).toBe('[REDACTED]');
            expect(maskSensitiveValue('deviceToken', { nested: deviceToken })).toBe('[REDACTED]');
        });

        it('keeps a value an earlier layer already masked', () => {
            expect(maskSensitiveValue('email', '[EMAIL:@gmail.com]')).toBe('[EMAIL:@gmail.com]');
            expect(maskSensitiveValue('phone', '[PHONE:…5678]')).toBe('[PHONE:…5678]');
        });

        it('keeps a placeholder only of the kind the name prints', () => {
            const email = '[EMAIL:@gmail.com]';
            expect(maskSensitiveValue('password', email)).toBe('[REDACTED]');
            // Judged afresh instead, as any value under a token name is — never kept as it came.
            expect(maskSensitiveValue('deviceToken', email)).not.toBe(email);
            expect(maskSensitiveValue('deviceToken', '[TOKEN#abcdef]')).toBe('[TOKEN#abcdef]');
        });

        it('shows no part of a number shorter than nine digits', () => {
            expect(maskSensitiveValue('phone', '1234567')).toBe('[REDACTED]');
        });

        it('is [REDACTED] again for a strict caller', () => {
            expect(maskSensitiveValue('deviceToken', deviceToken, { strict: true })).toBe('[REDACTED]');
        });
    });
});

describe('redactSensitive in detail', () => {
    it('masks in detail by default and bare when strict', () => {
        const input = { email: 'someone@gmail.com', note: 'call 010-1234-5678', password: 'hunter2' };

        expect(redactSensitive(input)).toEqual({
            email: '[EMAIL:@gmail.com]',
            note: 'call [PHONE:…5678]',
            password: '[REDACTED]',
        });
        expect(redactSensitive(input, { strict: true })).toEqual({
            email: '[REDACTED]',
            note: 'call [PHONE]',
            password: '[REDACTED]',
        });
    });

    it('masks the names safe only for the log pipeline when strict', () => {
        expect(redactSensitive({ responseCode: 'ABC' })).toEqual({ responseCode: 'ABC' });
        expect(redactSensitive({ responseCode: 'ABC' }, { strict: true })).toEqual({ responseCode: '[REDACTED]' });
    });

    it('gives a strict caller exactly what it got before, even from a body masked in detail', () => {
        const detailed = redactSensitive({ email: 'someone@gmail.com', note: 'mail someone@gmail.com' });
        expect(redactSensitive(detailed, { strict: true })).toEqual({ email: '[REDACTED]', note: 'mail [EMAIL]' });
    });
});

describe('truncate around a detailed placeholder', () => {
    it('never cuts through one, so a strict reader cannot get its pieces', () => {
        // Lands the 2,048-character cut inside the placeholder, after `[EMAIL:@gmail.co`.
        const prefix = 'x'.repeat(MAX_BODY_BYTES - '[EMAIL:@gmail.co'.length - 1);
        const cut = truncate(`${prefix}[EMAIL:@gmail.com] tail`) as string;

        expect(cut.endsWith(`${prefix}…[truncated]`)).toBe(true);
        expect(cut).not.toContain('[EMAIL');
    });

    it('leaves a bare placeholder at the cut as it always did', () => {
        const prefix = 'x'.repeat(MAX_BODY_BYTES - '[REDAC'.length - 1);
        expect(truncate(`${prefix}[REDACTED] tail`)).toBe(`"${prefix}[REDAC…[truncated]`);
    });
});

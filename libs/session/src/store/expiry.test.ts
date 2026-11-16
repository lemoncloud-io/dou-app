import { msUntilExpiration, msUntilTokenExpiry } from './expiry';

const NOW = Date.UTC(2026, 10, 11, 12, 0, 0);

/** A JWT-shaped token whose payload is `claims`, base64url-encoded with the padding stripped. */
const jwt = (claims: Record<string, unknown>) =>
    `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;

describe('msUntilTokenExpiry', () => {
    it("reads the payload's `exp`, in seconds, as milliseconds from now", () => {
        expect(msUntilTokenExpiry(jwt({ exp: NOW / 1000 + 3_600 }), NOW)).toBe(3_600_000);
    });

    it('answers negative for a token already past its `exp`', () => {
        expect(msUntilTokenExpiry(jwt({ exp: NOW / 1000 - 60 }), NOW)).toBe(-60_000);
    });

    it('decodes a payload that needed padding and uses the URL-safe alphabet', () => {
        // Characters that encode to `-`/`_` in base64url, and a length that is not a multiple of three.
        const token = jwt({ exp: NOW / 1000 + 10, note: '>>?~~' });

        expect(token.split('.')[1]).toMatch(/[-_]/);
        expect(msUntilTokenExpiry(token, NOW)).toBe(10_000);
    });

    it('cannot measure what is not a token, or a payload with no numeric `exp`', () => {
        expect(msUntilTokenExpiry(undefined, NOW)).toBeNull();
        expect(msUntilTokenExpiry(42, NOW)).toBeNull();
        expect(msUntilTokenExpiry('not-a-jwt', NOW)).toBeNull();
        expect(msUntilTokenExpiry('header.!!!.signature', NOW)).toBeNull();
        expect(msUntilTokenExpiry(`header.${Buffer.from('{oops').toString('base64url')}.s`, NOW)).toBeNull();
        expect(msUntilTokenExpiry(jwt({ exp: 'soon' }), NOW)).toBeNull();
        expect(msUntilTokenExpiry(jwt({}), NOW)).toBeNull();
    });
});

describe('msUntilExpiration', () => {
    it('still measures an AWS credential instant', () => {
        expect(msUntilExpiration(new Date(NOW + 5_000).toISOString(), NOW)).toBe(5_000);
        expect(msUntilExpiration(undefined, NOW)).toBeNull();
    });
});

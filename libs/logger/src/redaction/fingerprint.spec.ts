import { createHash } from 'crypto';

import {
    emailPlaceholder,
    foldDetailedPlaceholders,
    isDetailed,
    phonePlaceholder,
    placeholderKindOf,
    restoreShelved,
    shelveDetailedPlaceholders,
    tokenPlaceholder,
} from './fingerprint';

const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 6);

describe('isDetailed', () => {
    it('is on for every caller except a strict one', () => {
        expect(isDetailed()).toBe(true);
        expect(isDetailed({})).toBe(true);
        expect(isDetailed({ strict: true })).toBe(false);
    });
});

describe('placeholders', () => {
    it('fingerprint a token with the first six hex characters of its SHA-256', () => {
        const token = 'eyJhbGciOiJIUzI1NiJ9.e30.sig';
        expect(tokenPlaceholder('JWT', token, true)).toBe(`[JWT#${fingerprint(token)}]`);
        expect(tokenPlaceholder('TOKEN', token, false)).toBe('[TOKEN]');
        // Too short to fingerprint: an unkeyed hash of a short value can be matched by guessing.
        expect(tokenPlaceholder('TOKEN', '12345678', true)).toBe('[TOKEN]');
    });

    it('show the last four digits of a number and no fingerprint', () => {
        expect(phonePlaceholder('010-1234-5678', true)).toBe('[PHONE:…5678]');
        expect(phonePlaceholder('+821012345678', true)).toBe('[PHONE:…5678]');
        expect(phonePlaceholder('010-1234-5678', false)).toBe('[PHONE]');
    });

    it('show the domain only for a listed mail provider, matched case-insensitively and exactly', () => {
        expect(emailPlaceholder('jane@NAVER.com', true)).toBe('[EMAIL:@naver.com]');
        expect(emailPlaceholder('jane@yahoo.co.kr', true)).toBe('[EMAIL:@yahoo.co.kr]');
        // A personal or company domain, and a subdomain of a listed one, show nothing.
        expect(emailPlaceholder('jane@jane-doe.com', true)).toBe('[EMAIL]');
        expect(emailPlaceholder('jane@mail.naver.com', true)).toBe('[EMAIL]');
        expect(emailPlaceholder('jane@gmail.com', false)).toBe('[EMAIL]');
    });
});

describe('placeholders already in a text', () => {
    const detailed = 'a [JWT#3f9a1c] b [PHONE:…5678] c [EMAIL:@gmail.com] d [TOKEN#b07e22]';

    it('fold back to bare', () => {
        expect(foldDetailedPlaceholders(detailed)).toBe('a [JWT] b [PHONE] c [EMAIL] d [TOKEN]');
    });

    it('are shelved and restored unchanged', () => {
        const { text, shelved } = shelveDetailedPlaceholders(detailed);
        expect(text).not.toContain('[');
        expect(shelved).toHaveLength(4);
        expect(restoreShelved(text, shelved)).toBe(detailed);
    });

    it('are recognised as whole values', () => {
        expect(placeholderKindOf('[REDACTED]')).toBe('REDACTED');
        expect(placeholderKindOf('[EMAIL:@gmail.com]')).toBe('EMAIL');
        expect(placeholderKindOf('[PHONE:…5678]')).toBe('PHONE');
        expect(placeholderKindOf('[TOKEN#b07e22]')).toBe('TOKEN');
        expect(placeholderKindOf('[JWT]')).toBe('JWT');
        expect(placeholderKindOf('[EMAIL] and more')).toBeUndefined();
        expect(placeholderKindOf(42)).toBeUndefined();
    });

    it('match only the exact forms the builders print, so nothing can pass as one', () => {
        for (const forged of [
            '[EMAIL:jane@gmail.com]',
            '[EMAIL:@jane-doe.com]',
            '[TOKEN#abcdef:eyJhbGciOiJIUzI1NiJ9]',
            '[PHONE:…01012345678]',
            '[PHONE:hunter2]',
        ]) {
            expect(placeholderKindOf(forged)).toBeUndefined();
            expect(foldDetailedPlaceholders(forged)).toBe(forged);
        }
    });

    it('leave a text that already holds the shelf mark unshelved', () => {
        const text = 'x 0 [JWT#abcdef]';
        const { text: out, shelved } = shelveDetailedPlaceholders(text);
        expect(out).toBe(text);
        expect(shelved).toEqual([]);
    });
});

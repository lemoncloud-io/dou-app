import { createHmac } from 'crypto';

import {
    createRedactionSalt,
    emailPlaceholder,
    foldDetailedPlaceholders,
    placeholderKindOf,
    phonePlaceholder,
    redactionSaltFor,
    restoreShelved,
    setRedactionSalt,
    shelveDetailedPlaceholders,
    tokenPlaceholder,
} from './fingerprint';

const SALT = 'device-salt-0123456789';
const fingerprint = (value: string) => createHmac('sha256', SALT).update(value).digest('hex').slice(0, 6);

afterEach(() => setRedactionSalt(undefined));

describe('the salt slot', () => {
    it('has no salt until a host sets one', () => {
        expect(redactionSaltFor()).toBeUndefined();
    });

    it('refuses a salt shorter than 16 characters', () => {
        setRedactionSalt('short');
        expect(redactionSaltFor()).toBeUndefined();
    });

    it('withholds the salt from a strict caller', () => {
        setRedactionSalt(SALT);
        expect(redactionSaltFor()).toBe(SALT);
        expect(redactionSaltFor({ strict: true })).toBeUndefined();
    });
});

describe('placeholders', () => {
    it('fingerprint a token with the first six hex characters of HMAC-SHA256(salt, token)', () => {
        expect(tokenPlaceholder('JWT', 'eyJabc', SALT)).toBe(`[JWT#${fingerprint('eyJabc')}]`);
        expect(tokenPlaceholder('TOKEN', 'abc', undefined)).toBe('[TOKEN]');
    });

    it('show the last four digits of a number and fingerprint its digits only', () => {
        const expected = `[PHONE#${fingerprint('01012345678')}:…5678]`;
        expect(phonePlaceholder('010-1234-5678', SALT)).toBe(expected);
        expect(phonePlaceholder('01012345678', SALT)).toBe(expected);
        expect(phonePlaceholder('010-1234-5678', undefined)).toBe('[PHONE]');
    });

    it('show the domain only for a listed mail provider, matched case-insensitively and exactly', () => {
        expect(emailPlaceholder('jane@NAVER.com', SALT)).toBe(`[EMAIL#${fingerprint('jane@naver.com')}:@naver.com]`);
        expect(emailPlaceholder('jane@yahoo.co.kr', SALT)).toBe(
            `[EMAIL#${fingerprint('jane@yahoo.co.kr')}:@yahoo.co.kr]`
        );
        // A personal or company domain, and a subdomain of a listed one, show no domain.
        expect(emailPlaceholder('jane@jane-doe.com', SALT)).toBe(`[EMAIL#${fingerprint('jane@jane-doe.com')}]`);
        expect(emailPlaceholder('jane@mail.naver.com', SALT)).toBe(`[EMAIL#${fingerprint('jane@mail.naver.com')}]`);
    });

    it('show the domain of an address and fingerprint it case-insensitively', () => {
        const expected = `[EMAIL#${fingerprint('someone@gmail.com')}:@gmail.com]`;
        expect(emailPlaceholder('Someone@Gmail.com', SALT)).toBe(expected);
        expect(emailPlaceholder('someone@gmail.com', undefined)).toBe('[EMAIL]');
    });
});

describe('placeholders already in a text', () => {
    const detailed = 'a [JWT#3f9a1c] b [PHONE#a1b2c3:…5678] c [EMAIL#9d0e11:@gmail.com] d [TOKEN#b07e22]';

    it('fold back to bare', () => {
        expect(foldDetailedPlaceholders(detailed)).toBe('a [JWT] b [PHONE] c [EMAIL] d [TOKEN]');
    });

    it('are shelved and restored unchanged', () => {
        const { text, shelved } = shelveDetailedPlaceholders(detailed);
        expect(text).not.toContain('#');
        expect(shelved).toHaveLength(4);
        expect(restoreShelved(text, shelved)).toBe(detailed);
    });

    it('are recognised as whole values', () => {
        expect(placeholderKindOf('[REDACTED]')).toBe('REDACTED');
        expect(placeholderKindOf('[EMAIL#9d0e11:@gmail.com]')).toBe('EMAIL');
        expect(placeholderKindOf('[EMAIL#9d0e11]')).toBe('EMAIL');
        expect(placeholderKindOf('[PHONE#a1b2c3:…5678]')).toBe('PHONE');
        expect(placeholderKindOf('[JWT]')).toBe('JWT');
        expect(placeholderKindOf('[EMAIL] and more')).toBeUndefined();
        expect(placeholderKindOf(42)).toBeUndefined();
    });

    it('match only the exact forms the builders print, so nothing can pass as one', () => {
        for (const forged of [
            '[EMAIL#abcdef:jane@gmail.com]',
            '[EMAIL#abcdef:hunter2hunter2]',
            '[EMAIL#abcdef:@jane-doe.com]',
            '[TOKEN#abcdef:eyJhbGciOiJIUzI1NiJ9]',
            '[PHONE#abcdef:01012345678]',
        ]) {
            expect(placeholderKindOf(forged)).toBeUndefined();
            expect(foldDetailedPlaceholders(forged)).toBe(forged);
        }
    });

    it('leave a text that already holds the shelf mark unshelved', () => {
        const text = 'x \uE0000\uE000 [JWT#abcdef]';
        const { text: out, shelved } = shelveDetailedPlaceholders(text);
        expect(out).toBe(text);
        expect(shelved).toEqual([]);
    });
});

describe('createRedactionSalt', () => {
    const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    const stubCrypto = (value: unknown): void => {
        Object.defineProperty(globalThis, 'crypto', { value, configurable: true, writable: true });
    };

    afterEach(() => {
        if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
        else delete (globalThis as { crypto?: unknown }).crypto;
    });

    it('draws 16 random bytes as hex from getRandomValues', () => {
        expect(createRedactionSalt()).toMatch(/^[0-9a-f]{32}$/);
        expect(createRedactionSalt()).not.toBe(createRedactionSalt());
    });

    it('gives no salt where the runtime has no cryptographic random source, rather than Math.random', () => {
        const random = jest.spyOn(Math, 'random');
        stubCrypto(undefined);

        expect(createRedactionSalt()).toBeUndefined();
        expect(random).not.toHaveBeenCalled();
        random.mockRestore();
    });

    it('gives no salt when getRandomValues throws', () => {
        stubCrypto({
            getRandomValues: () => {
                throw new Error('insecure context');
            },
        });

        expect(createRedactionSalt()).toBeUndefined();
    });
});

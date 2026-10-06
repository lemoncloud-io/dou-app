import { describe, expect, it } from 'vitest';

import { isTrustedInviteBackend, parseInviteInput, type ParsedInvite } from './parseInviteInput';

const CONFIGURED = ['https://api.eureka.codes/dou-d1', 'https://api.eureka.codes/d1'];

describe('parseInviteInput', () => {
    it('composes the API Gateway backend from api + stage', () => {
        expect(parseInviteInput('https://app-dev.chatic.io/s?code=invt:1:abc&api=uzjpiaey7a&stage=dev')).toEqual({
            code: 'invt:1:abc',
            backend: 'https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev',
        });
    });

    it('leaves a bare code without a backend', () => {
        expect(parseInviteInput('  invt:1:abc ')).toEqual({ code: 'invt:1:abc' });
    });

    it('refuses a link that carries no code', () => {
        expect(parseInviteInput('https://app-dev.chatic.io/s?api=uzjpiaey7a&stage=dev')).toEqual({ refused: 'format' });
    });
});

// The server issues `/i?t=<base64url JSON>` by default; `c` is the code, `a` + `s` the backend, `r` the relay flag.
const encodedLink = (payload: unknown, origin = 'https://app-dev.chatic.io'): string =>
    `${origin}/i?t=${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`;

describe('parseInviteInput with an encoded link', () => {
    it('reads the code and composes the backend from a + s', () => {
        expect(parseInviteInput(encodedLink({ c: 'invt:1:abc', a: 'uzjpiaey7a', s: 'dev' }))).toEqual({
            code: 'invt:1:abc',
            backend: 'https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev',
        });
    });

    it('refuses a relay invite instead of sending it to the relay server', () => {
        expect(parseInviteInput(encodedLink({ c: 'invt:1:abc', r: 1 }))).toEqual({ refused: 'relay' });
    });

    it('refuses a link with no address instead of guessing one', () => {
        expect(parseInviteInput(encodedLink({ c: 'invt:1:abc' }))).toEqual({ refused: 'unmarked' });
        expect(parseInviteInput(encodedLink({ c: 'invt:1:abc', a: 'uzjpiaey7a' }))).toEqual({ refused: 'unmarked' });
    });

    it('refuses a token that cannot be read', () => {
        expect(parseInviteInput('https://app-dev.chatic.io/i?t=%%%')).toEqual({ refused: 'format' });
        expect(parseInviteInput('https://app-dev.chatic.io/i')).toEqual({ refused: 'format' });
    });

    it('reads a link pasted without its scheme', () => {
        expect(
            parseInviteInput(encodedLink({ c: 'invt:1:abc', a: 'uzjpiaey7a', s: 'dev' }, 'app-dev.chatic.io'))
        ).toEqual({ code: 'invt:1:abc', backend: 'https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev' });
    });

    it('finds a link inside a message and ignores the sentence around it', () => {
        const link = encodedLink({ c: 'invt:1:abc', a: 'uzjpiaey7a', s: 'dev' });
        expect(parseInviteInput(`[Chatic] Kim invited you. ${link}.`)).toEqual({
            code: 'invt:1:abc',
            backend: 'https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev',
        });
    });

    it('finds a legacy link inside a message', () => {
        expect(
            parseInviteInput('Join us: https://app-dev.chatic.io/s?code=invt:1:abc&api=uzjpiaey7a&stage=dev thanks')
        ).toEqual({
            code: 'invt:1:abc',
            backend: 'https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev',
        });
    });
});

describe('parseInviteInput with a legacy relay link', () => {
    it('refuses the &relay flag', () => {
        expect(parseInviteInput('https://app-dev.chatic.io/s?code=invt:1:abc&relay')).toEqual({ refused: 'relay' });
    });

    it('refuses a link that names no address, as web reads it', () => {
        expect(parseInviteInput('https://app-dev.chatic.io/s?code=invt:1:abc')).toEqual({ refused: 'relay' });
    });

    it('refuses half an address as unreadable', () => {
        expect(parseInviteInput('https://app-dev.chatic.io/s?code=invt:1:abc&api=uzjpiaey7a')).toEqual({
            refused: 'format',
        });
    });
});

describe('parseInviteInput with several links in a message', () => {
    it('opens the one on an invite path, not the first link', () => {
        const link = encodedLink({ c: 'invt:1:abc', a: 'uzjpiaey7a', s: 'dev' });
        expect(parseInviteInput(`Get the app at chatic.io/download, then open ${link}`)).toEqual({
            code: 'invt:1:abc',
            backend: 'https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev',
        });
    });
});

describe('isTrustedInviteBackend', () => {
    it('accepts the API Gateway address a server-issued invite composes', () => {
        expect(isTrustedInviteBackend('https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev', [])).toBe(
            true
        );
        expect(isTrustedInviteBackend('https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/prod/', [])).toBe(
            true
        );
    });

    it('accepts a backend this build is configured with, ignoring a trailing slash', () => {
        expect(isTrustedInviteBackend('https://api.eureka.codes/d1/', CONFIGURED)).toBe(true);
    });

    it('rejects any other server named by a backend param', () => {
        expect(isTrustedInviteBackend('https://evil.example/d1', CONFIGURED)).toBe(false);
        // Same host, different deployment path: not one this build talks to.
        expect(isTrustedInviteBackend('https://api.eureka.codes/v1', CONFIGURED)).toBe(false);
        expect(isTrustedInviteBackend('http://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev', [])).toBe(
            false
        );
        expect(isTrustedInviteBackend('https://uzjpiaey7a.execute-api.us-east-1.amazonaws.com/dev', [])).toBe(false);
    });

    it('rejects an api param crafted to move the host', () => {
        const parsed = parseInviteInput('https://app.chatic.io/s?code=invt:1:abc&api=evil.example%23&stage=dev');
        expect((parsed as ParsedInvite).backend).toBeDefined();
        expect(isTrustedInviteBackend((parsed as ParsedInvite).backend as string, CONFIGURED)).toBe(false);
    });

    it('does not treat an unconfigured (empty) entry as a match', () => {
        expect(isTrustedInviteBackend('', ['', ''])).toBe(false);
    });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const configValues: Record<string, unknown> = {
    'net.socialOauth.endpoint': 'https://relay.example',
    'net.deeplink.desktopProtocol': 'chatic-dev',
};
vi.mock('@chatic/config', () => ({ config: { get: (key: string) => configValues[key] } }));

import { buildAuthorizeUrl, buildOAuthDeeplink, parseOAuthDeeplink } from './oauth';

describe('parseOAuthDeeplink', () => {
    it.each(['chatic', 'chatic-dev'])('parses a %s:// deeplink', scheme => {
        expect(parseOAuthDeeplink(`${scheme}://oauth?provider=google&code=abc`)).toEqual({
            provider: 'google',
            code: 'abc',
        });
    });

    it('accepts a trailing slash after the host', () => {
        expect(parseOAuthDeeplink('chatic://oauth/?provider=google&code=abc')).toEqual({
            provider: 'google',
            code: 'abc',
        });
    });

    it('carries a nonce when the deeplink has one', () => {
        expect(parseOAuthDeeplink('chatic://oauth?provider=google&code=abc&nonce=n1')).toEqual({
            provider: 'google',
            code: 'abc',
            nonce: 'n1',
        });
    });

    it('does not default a missing provider to google', () => {
        expect(parseOAuthDeeplink('chatic://oauth?code=abc')).toBeNull();
        expect(parseOAuthDeeplink('chatic://oauth?provider=&code=abc')).toBeNull();
    });

    it('rejects a provider the flow does not know', () => {
        expect(parseOAuthDeeplink('chatic://oauth?provider=evil&code=abc')).toBeNull();
    });

    it('rejects an empty or missing code', () => {
        expect(parseOAuthDeeplink('chatic://oauth?provider=google&code=')).toBeNull();
        expect(parseOAuthDeeplink('chatic://oauth?provider=google')).toBeNull();
        expect(parseOAuthDeeplink('chatic://oauth')).toBeNull();
    });

    // These all start with `chatic://oauth`, which is what the old prefix comparison accepted.
    it.each([
        'chatic://oauth.evil.example?provider=google&code=abc',
        'chatic://oauthx?provider=google&code=abc',
        'chatic://oauth@evil?provider=google&code=abc',
        'chatic://oauth:8080?provider=google&code=abc',
        'chatic://oauth/extra?provider=google&code=abc',
        'chatic://evil/oauth?provider=google&code=abc',
    ])('rejects %s', url => {
        expect(parseOAuthDeeplink(url)).toBeNull();
    });

    it('rejects other schemes and other deeplinks', () => {
        expect(parseOAuthDeeplink('https://oauth?provider=google&code=abc')).toBeNull();
        expect(parseOAuthDeeplink('chatic-open://oauth?provider=google&code=abc')).toBeNull();
        expect(parseOAuthDeeplink('chatic://room/1')).toBeNull();
        expect(parseOAuthDeeplink('not a url')).toBeNull();
        expect(parseOAuthDeeplink('')).toBeNull();
    });
});

describe('buildOAuthDeeplink', () => {
    it('round-trips through parseOAuthDeeplink on the configured channel scheme', () => {
        const url = buildOAuthDeeplink('google', 'a b&c');

        expect(url.startsWith('chatic-dev://oauth?')).toBe(true);
        expect(parseOAuthDeeplink(url)).toEqual({ provider: 'google', code: 'a b&c' });
    });
});

describe('buildAuthorizeUrl', () => {
    beforeEach(() => {
        window.history.replaceState(null, '', '/');
    });

    const redirectOf = (url: string): string => new URL(url).searchParams.get('redirect') ?? '';

    it('returns to this origin hand-off page', () => {
        const url = buildAuthorizeUrl('google');

        expect(url.startsWith('https://relay.example/oauth/google/authorize?redirect=')).toBe(true);
        expect(redirectOf(url)).toBe(`${window.location.origin}/auth/oauth-response`);
    });

    it('adds the nonce to the redirect address only when given one', () => {
        expect(redirectOf(buildAuthorizeUrl('google', 'n1'))).toBe(
            `${window.location.origin}/auth/oauth-response?nonce=n1`
        );
        expect(redirectOf(buildAuthorizeUrl('google'))).not.toContain('nonce');
    });
});

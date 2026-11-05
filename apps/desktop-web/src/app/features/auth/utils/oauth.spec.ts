import { beforeEach, describe, expect, it, vi } from 'vitest';

const configValues: Record<string, unknown> = {
    'net.socialOauth.endpoint': 'https://relay.example',
    'net.deeplink.desktopProtocol': 'chatic-dev',
};
vi.mock('@chatic/config', () => ({ config: { get: (key: string) => configValues[key] } }));

import { buildAuthorizeUrl, buildOAuthDeeplink, oauthProviderName, parseOAuthDeeplink } from './oauth';

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
        const url = buildOAuthDeeplink('google', 'a b&c', 'n1');

        expect(url.startsWith('chatic-dev://oauth?')).toBe(true);
        expect(parseOAuthDeeplink(url)).toEqual({ provider: 'google', code: 'a b&c', nonce: 'n1' });
    });

    it('carries the nonce it was given', () => {
        expect(new URL(buildOAuthDeeplink('google', 'abc', 'n1')).searchParams.get('nonce')).toBe('n1');
    });
});

describe('buildAuthorizeUrl', () => {
    beforeEach(() => {
        window.history.replaceState(null, '', '/');
    });

    const redirectOf = (url: string): string => new URL(url).searchParams.get('redirect') ?? '';

    it('returns to this origin hand-off page', () => {
        const url = buildAuthorizeUrl('google', 'n1');

        expect(url.startsWith('https://relay.example/oauth/google/authorize?redirect=')).toBe(true);
        expect(new URL(redirectOf(url)).pathname).toBe('/auth/oauth-response');
    });

    it('always carries the nonce on the redirect address', () => {
        expect(redirectOf(buildAuthorizeUrl('google', 'n1'))).toBe(
            `${window.location.origin}/auth/oauth-response?nonce=n1&provider=google`
        );
    });
});

describe('Apple sign-in', () => {
    beforeEach(() => {
        window.history.replaceState(null, '', '/');
    });

    it('accepts an apple deeplink', () => {
        expect(parseOAuthDeeplink('chatic://oauth?provider=apple&code=abc&nonce=n1')).toEqual({
            provider: 'apple',
            code: 'abc',
            nonce: 'n1',
        });
    });

    it('still rejects a provider name in another case', () => {
        expect(parseOAuthDeeplink('chatic://oauth?provider=APPLE&code=abc')).toBeNull();
    });

    it('sends the browser to the relay apple authorize page', () => {
        expect(
            buildAuthorizeUrl('apple', 'n1').startsWith('https://relay.example/oauth/apple/authorize?redirect=')
        ).toBe(true);
    });

    // The hand-off page reads the provider off this address. Carried here so an Apple code that comes
    // back without the relay naming the provider is not read as a Google one and refused.
    it('carries the provider on the hand-off address', () => {
        const redirect = new URL(new URL(buildAuthorizeUrl('apple', 'n1')).searchParams.get('redirect') ?? '');

        expect(redirect.searchParams.get('provider')).toBe('apple');
        expect(redirect.searchParams.get('nonce')).toBe('n1');
    });

    it('names each provider as its brand writes it', () => {
        expect(oauthProviderName('google')).toBe('Google');
        expect(oauthProviderName('apple')).toBe('Apple');
    });
});

import { isAllowedSubWebViewUrl, SUB_WEBVIEW_DOMAINS } from './subWebViewAllowlist';

describe('isAllowedSubWebViewUrl', () => {
    it.each([
        ['a page on a subdomain, with any path', 'https://foo.apps.chatic.io/notice?id=1'],
        ['the root of a subdomain', 'https://foo.apps.chatic.io'],
        ['a dev subdomain', 'https://foo.apps-dev.chatic.io/'],
        ['mixed case', 'HTTPS://Foo.Apps.Chatic.IO/'],
    ])('allows %s', (_label, url) => {
        expect(isAllowedSubWebViewUrl(url)).toBe(true);
    });

    it.each([
        ['the domain itself, which is not a page', 'https://apps.chatic.io/'],
        ['two labels deep', 'https://a.b.apps.chatic.io/'],
        ['a lookalike domain', 'https://foo.apps.chatic.io.evil.example/'],
        ['a lookalike label', 'https://evilapps.chatic.io/'],
        ['http', 'http://foo.apps.chatic.io/'],
        ['a port', 'https://foo.apps.chatic.io:8443/'],
        ['userinfo before the host', 'https://user@foo.apps.chatic.io/'],
        ['userinfo that hides the real host', 'https://foo.apps.chatic.io@evil.example/'],
        ['a backslash before userinfo', 'https://evil.example\\@foo.apps.chatic.io/'],
        ['whitespace', 'https://foo.apps.chatic.io/a b'],
        ['a control character', 'https://foo.apps.chatic.io/\u0000'],
        ['not a URL', 'foo.apps.chatic.io'],
        ['not a string', 42],
    ])('refuses %s', (_label, url) => {
        expect(isAllowedSubWebViewUrl(url)).toBe(false);
    });

    it.each(['https://dou.chatic.io/', 'https://dou-dev.chatic.io/', 'https://app.chatic.io/', 'https://x.chatic.io/'])(
        'refuses %s, which is not under a sub WebView domain',
        url => {
            expect(isAllowedSubWebViewUrl(url)).toBe(false);
        }
    );

    it('is a subtree of its own, not the whole of chatic.io', () => {
        expect(SUB_WEBVIEW_DOMAINS).toEqual(['apps.chatic.io', 'apps-dev.chatic.io']);
    });
});

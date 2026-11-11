import {
    fitsSubWebViewData,
    isOpenableSubWebViewUrl,
    isSubWebViewAppId,
    isSubWebViewParams,
    subWebViewOriginOf,
    subWebViewTrustOf,
} from './subWebViewTrust';
import { subWebViewPageUrlOfNavigatePath } from './subWebViewLink';

describe('subWebViewTrustOf', () => {
    it.each([
        ['the prod hub', 'https://apps.chatic.io'],
        ['the prod hub with a path', 'https://apps.chatic.io/welcome?x=1'],
        ['the dev hub', 'https://apps-dev.chatic.io/'],
        ['mixed case', 'HTTPS://Apps.Chatic.IO/'],
    ])('reads %s as firstParty', (_label, url) => {
        expect(subWebViewTrustOf(url)).toBe('firstParty');
    });

    // The cases the mobile shell's allow-list accepts: the reviewed tier is that list, unchanged.
    it.each([
        ['a page on a subdomain, with any path', 'https://foo.apps.chatic.io/notice?id=1'],
        ['the root of a subdomain', 'https://foo.apps.chatic.io'],
        ['a dev subdomain', 'https://foo.apps-dev.chatic.io/'],
        ['mixed case', 'HTTPS://Foo.Apps.Chatic.IO/'],
        ['a reviewed mini app', 'https://dou-raise.apps.chatic.io'],
    ])('reads %s as reviewed', (_label, url) => {
        expect(subWebViewTrustOf(url)).toBe('reviewed');
    });

    it.each([
        ['another site', 'https://example.com'],
        ['two labels under the page domain', 'https://a.b.apps.chatic.io/'],
        ['a lookalike of the hub', 'https://apps.chatic.io.evil.com'],
        ['a lookalike of a page', 'https://foo.apps.chatic.io.evil.example/'],
        ['a lookalike label', 'https://evilapps.chatic.io/'],
        ['the web app, which is not under the page domain', 'https://dou.chatic.io/'],
        ['the bare domain, which is not the whole of chatic.io', 'https://chatic.io/'],
    ])('reads %s as external', (_label, url) => {
        expect(subWebViewTrustOf(url)).toBe('external');
    });

    it.each([
        ['http', 'http://apps.chatic.io/'],
        ['http to a page', 'http://foo.apps.chatic.io/'],
        ['a port on the hub', 'https://apps.chatic.io:8443/'],
        ['a port on a page', 'https://foo.apps.chatic.io:8443/'],
        ['userinfo before the hub', 'https://x@apps.chatic.io'],
        ['userinfo before a page', 'https://user@foo.apps.chatic.io/'],
        ['userinfo that hides the real host', 'https://apps.chatic.io@evil.example/'],
        ['a backslash before userinfo', 'https://evil.example\\@foo.apps.chatic.io/'],
        ['a backslash in the path', 'https://apps.chatic.io\\evil'],
        ['whitespace', 'https://apps.chatic.io/a b'],
        ['a leading space', ' https://apps.chatic.io/'],
        ['a control character', 'https://foo.apps.chatic.io/\u0000'],
        ['a trailing dot on the host', 'https://apps.chatic.io./'],
        ['a percent-encoded host', 'https://apps%2echatic.io/'],
        ['a single-label host', 'https://localhost/'],
        ['an IPv4 literal', 'https://10.0.0.1/'],
        ['a short IPv4 literal Chromium would rewrite', 'https://127.1/'],
        ['a hex IPv4 label', 'https://0x7f.0x1/'],
        ['no host', 'https:///path'],
        ['not a URL', 'apps.chatic.io'],
        ['javascript', 'javascript:alert(1)'],
        ['an empty string', ''],
        ['not a string', 42],
    ])('refuses %s', (_label, url) => {
        expect(subWebViewTrustOf(url)).toBeNull();
        expect(isOpenableSubWebViewUrl(url)).toBe(false);
    });
});

describe('isOpenableSubWebViewUrl', () => {
    it.each(['https://apps.chatic.io', 'https://dou-raise.apps.chatic.io/x', 'https://example.com/a?b=c#d'])(
        'accepts %s',
        url => {
            expect(isOpenableSubWebViewUrl(url)).toBe(true);
        }
    );
});

describe('the data limits', () => {
    it('takes JSON up to 16 KiB serialized, and nothing that is not JSON', () => {
        expect(fitsSubWebViewData(undefined)).toBe(true);
        expect(fitsSubWebViewData({ a: 'x'.repeat(16 * 1024 - 10) })).toBe(true);
        expect(fitsSubWebViewData({ a: 'x'.repeat(16 * 1024) })).toBe(false);
        const cycle: Record<string, unknown> = {};
        cycle.self = cycle;
        expect(fitsSubWebViewData(cycle)).toBe(false);
        expect(fitsSubWebViewData(BigInt(1))).toBe(false);
    });

    it('takes params only as a plain object', () => {
        expect(isSubWebViewParams({ a: 1 })).toBe(true);
        expect(isSubWebViewParams([1])).toBe(false);
        expect(isSubWebViewParams(null)).toBe(false);
    });

    it('takes an app id as one lower-case label', () => {
        expect(isSubWebViewAppId('dou-raise')).toBe(true);
        expect(isSubWebViewAppId('Quiz')).toBe(false);
        expect(isSubWebViewAppId('a.b')).toBe(false);
    });
});

describe('subWebViewOriginOf', () => {
    it.each([
        ['https://Example.COM/a?b#c', 'https://example.com'],
        ['https://apps.chatic.io', 'https://apps.chatic.io'],
        ['https://foo.apps.chatic.io?x=1', 'https://foo.apps.chatic.io'],
    ])('reads the origin of %s', (url, origin) => {
        expect(subWebViewOriginOf(url)).toBe(origin);
    });

    it('has no origin for a URL it would not open', () => {
        expect(subWebViewOriginOf('https://x@example.com')).toBeNull();
    });
});

// Any https opens only when the web opens a link an owner saved. A push or a deep link reaches the
// web from outside, so its gate stays the reviewed pages alone.
describe('the push and deep-link gate', () => {
    it.each(['https://example.com', 'https://apps.chatic.io/', 'https://apps.chatic.io.evil.com/'])(
        'still refuses %s, which a sub WebView can open',
        url => {
            expect(isOpenableSubWebViewUrl(url)).toBe(true);
            expect(subWebViewPageUrlOfNavigatePath(`/sub-webview?url=${encodeURIComponent(url)}`)).toBeNull();
        }
    );
});

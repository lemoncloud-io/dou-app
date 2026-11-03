import { decideSubWebViewNavigation } from './subWebViewNavigation';

const top = (url: string) => decideSubWebViewNavigation({ url, isTopFrame: true });
const frame = (url: string) => decideSubWebViewNavigation({ url, isTopFrame: false });

describe('decideSubWebViewNavigation', () => {
    describe('a top-level navigation', () => {
        it.each(['https://foo.apps.chatic.io/next', 'about:blank'])('loads %s', url => {
            expect(top(url)).toBe('load');
        });

        it.each([
            'https://www.naver.com/',
            'http://example.com/',
            'https://app.chatic.io/pricing',
            'mailto:help@example.com',
            'tel:+821000000000',
            'sms:+821000000000',
            'itms-apps://apps.apple.com/app/id1',
            'market://details?id=x',
        ])('hands %s to the OS', url => {
            expect(top(url)).toBe('external');
        });

        // The app's own routing belongs to the web that opened the view, not to the page under it.
        it.each([
            'chatic://s/home',
            'chatic-dev://s/home',
            'https://app.chatic.io/s/abc',
            'https://app-dev.chatic.io/s',
            'https://app.chatic.io/i?code=1',
        ])('blocks the app link %s', url => {
            expect(top(url)).toBe('block');
        });

        it.each([
            'intent://x#Intent;end',
            'data:text/html,x',
            'blob:https://foo.apps.chatic.io/1',
            'file:///etc/hosts',
        ])('blocks %s', url => {
            expect(top(url)).toBe('block');
        });

        // The OS resolves these to the app's own link host; a lookalike spelling must not get past.
        it.each([
            'https://x@app.chatic.io/s/abc',
            'https://app.chatic.io:443/s/abc',
            'https://app.chatic.io./i',
            'https://APP.CHATIC.IO/S/abc',
            'http://app.chatic.io/s/abc',
            'https://evil.example\\@app.chatic.io/s/abc',
        ])('blocks the disguised app link %s', url => {
            expect(top(url)).toBe('block');
        });

        // Userinfo, a backslash or whitespace make the OS read the URL differently from this check.
        it.each(['https://user@www.naver.com/', 'https://www.naver.com\\@evil.example/', 'https://www.naver.com/a b'])(
            'does not hand the ambiguous %s to the OS',
            url => {
                expect(top(url)).toBe('block');
            }
        );

        it('still hands mail addresses, which carry an @ of their own, to the OS', () => {
            expect(top('mailto:help@example.com')).toBe('external');
        });

        // A URL the allowlist reads two ways must not load in the view, whatever the OS then does.
        it('does not load an allowlisted host behind a backslash', () => {
            expect(top('https://evil.example\\@foo.apps.chatic.io/')).not.toBe('load');
        });
    });

    describe('a navigation inside a frame', () => {
        // No bridge to reach, so any https or in-memory document may load.
        it.each(['https://www.youtube.com/embed/x', 'about:srcdoc', 'data:text/html,x', 'blob:https://x/1'])(
            'loads %s',
            url => {
                expect(frame(url)).toBe('load');
            }
        );

        // Nothing a frame asks for reaches the OS.
        it.each(['http://example.com/', 'chatic://s/home', 'mailto:a@b.c', 'intent://x#Intent;end'])(
            'blocks %s',
            url => {
                expect(frame(url)).toBe('block');
            }
        );
    });

    // Android reports top-frame loads only and leaves the flag out.
    it('checks a request with no isTopFrame as a top-level one', () => {
        expect(decideSubWebViewNavigation({ url: 'chatic://s' })).toBe('block');
        expect(decideSubWebViewNavigation({ url: 'https://www.naver.com/' })).toBe('external');
    });
});

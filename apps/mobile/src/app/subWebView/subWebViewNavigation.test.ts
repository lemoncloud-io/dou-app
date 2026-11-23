import { decideSubWebViewNavigation } from './subWebViewNavigation';

const OPENED = 'https://foo.apps.chatic.io';
const top = (url: string) => decideSubWebViewNavigation({ url, isTopFrame: true }, OPENED);
const frame = (url: string) => decideSubWebViewNavigation({ url, isTopFrame: false }, OPENED);

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

        it.each(['https://user@www.naver.com/', 'https://www.naver.com\\@evil.example/', 'https://www.naver.com/a b'])(
            'does not hand the ambiguous %s to the OS',
            url => {
                expect(top(url)).toBe('block');
            }
        );

        it('still hands mail addresses, which carry an @ of their own, to the OS', () => {
            expect(top('mailto:help@example.com')).toBe('external');
        });

        it('does not load an allowlisted host behind a backslash', () => {
            expect(top('https://evil.example\\@foo.apps.chatic.io/')).not.toBe('load');
        });
    });

    describe('a navigation inside a frame', () => {
        it.each(['https://www.youtube.com/embed/x', 'about:srcdoc', 'data:text/html,x', 'blob:https://x/1'])(
            'loads %s',
            url => {
                expect(frame(url)).toBe('load');
            }
        );

        it.each(['http://example.com/', 'chatic://s/home', 'mailto:a@b.c', 'intent://x#Intent;end'])(
            'blocks %s',
            url => {
                expect(frame(url)).toBe('block');
            }
        );
    });

    it('checks a request with no isTopFrame as a top-level one', () => {
        expect(decideSubWebViewNavigation({ url: 'chatic://s' }, OPENED)).toBe('block');
        expect(decideSubWebViewNavigation({ url: 'https://www.naver.com/' }, OPENED)).toBe('external');
    });
});

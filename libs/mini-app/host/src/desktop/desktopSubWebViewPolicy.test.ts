import {
    acceptsSubWebViewMessage,
    allowsSubWebViewFrame,
    barTitleOf,
    checkDesktopSubWebViewOpen,
    decideDesktopSubWebViewNavigation,
    DESKTOP_SUB_WEBVIEW_OPEN_SCOPE,
    displayOf,
    fetchesManifest,
    readDesktopSubWebViewManifest,
} from './desktopSubWebViewPolicy';

describe('the desktop open request', () => {
    it("opens any plain https URL, so the handshake says 'anyHttps'", () => {
        expect(DESKTOP_SUB_WEBVIEW_OPEN_SCOPE).toBe('anyHttps');
    });

    it('keeps the tier, the origin, a title and the params, with no params as an empty object', () => {
        expect(checkDesktopSubWebViewOpen({ url: 'https://Quiz.apps.chatic.io/a', title: 'Quiz' })).toEqual({
            ok: true,
            url: 'https://Quiz.apps.chatic.io/a',
            origin: 'https://quiz.apps.chatic.io',
            trust: 'reviewed',
            title: 'Quiz',
            params: {},
        });
        expect(checkDesktopSubWebViewOpen({ url: 'https://example.com/', title: '' })).toEqual({
            ok: true,
            url: 'https://example.com/',
            origin: 'https://example.com',
            trust: 'external',
            params: {},
        });
    });

    it('calls a malformed request INVALID before it looks at the host', () => {
        expect(checkDesktopSubWebViewOpen({ url: 'https://10.0.0.1/', title: 3 })).toEqual({
            ok: false,
            code: 'INVALID',
        });
        expect(checkDesktopSubWebViewOpen({ url: 'https://10.0.0.1/' })).toEqual({ ok: false, code: 'NOT_ALLOWED' });
    });
});

describe('the desktop sub view policy', () => {
    const opened = 'https://quiz.apps.chatic.io';

    it.each([
        ['the opened origin', 'https://quiz.apps.chatic.io/level/2', 'load'],
        ['the opened origin in another case', 'HTTPS://Quiz.Apps.Chatic.IO/', 'load'],
        ['about:blank', 'about:blank', 'load'],
        ['another https site', 'https://example.com/', 'external'],
        ['another reviewed page', 'https://other.apps.chatic.io/', 'external'],
        ['an http site', 'http://example.com/', 'block'],
        ['mail', 'mailto:a@example.com', 'block'],
        ['the app’s own scheme', 'chatic://room/1', 'block'],
        ['javascript', 'javascript:alert(1)', 'block'],
        ['userinfo that hides the real host', 'https://quiz.apps.chatic.io@evil.example/', 'block'],
        ['a backslash', 'https://evil.example\\@quiz.apps.chatic.io/', 'block'],
        ['an invite link', 'https://app.chatic.io/i?t=abc', 'block'],
    ])('decides %s (%s) as %s', (_label, url, decision) => {
        expect(decideDesktopSubWebViewNavigation(url, opened)).toBe(decision);
    });

    it('lets a frame load web and in-memory documents only', () => {
        expect(allowsSubWebViewFrame('https://youtube.com/embed/x')).toBe(true);
        expect(allowsSubWebViewFrame('blob:https://quiz.apps.chatic.io/1')).toBe(true);
        expect(allowsSubWebViewFrame('chatic://room/1')).toBe(false);
        expect(allowsSubWebViewFrame('file:///etc/passwd')).toBe(false);
    });

    it.each([
        ['the opened page', { url: 'https://quiz.apps.chatic.io/a', isMainFrame: true }, true],
        ['a frame on the same origin', { url: 'https://quiz.apps.chatic.io/a', isMainFrame: false }, false],
        ['the page after it reached another origin', { url: 'https://example.com/', isMainFrame: true }, false],
        ['a frame that has gone', { url: undefined, isMainFrame: true }, false],
    ])('hears %s: %s', (_label, sender, heard) => {
        expect(acceptsSubWebViewMessage(sender, opened)).toBe(heard);
    });

    it('never asks an external site for a manifest, and always shows it with the bar', () => {
        expect(fetchesManifest('external')).toBe(false);
        expect(fetchesManifest('reviewed')).toBe(true);
        expect(fetchesManifest('firstParty')).toBe(true);
        expect(displayOf('external', { display: 'clean' })).toBe('titled');
        expect(displayOf('reviewed', { display: 'clean' })).toBe('clean');
        expect(displayOf('firstParty', {})).toBe('titled');
    });

    it('titles an external site with its host, whatever the page or the web asked for', () => {
        const view = { trust: 'external' as const, origin: 'https://example.com', title: 'DoU 로그인' };

        expect(barTitleOf(view, { requested: 'DoU', document: 'DoU — Sign in', manifestName: 'DoU' })).toBe(
            'example.com'
        );
    });

    it('titles a trusted page with what it asked for, then its document, the web’s title, its manifest, its host', () => {
        const view = { trust: 'reviewed' as const, origin: 'https://quiz.apps.chatic.io', title: 'Quiz' };

        expect(barTitleOf(view, { requested: 'Level 2', document: 'Doc', manifestName: 'M' })).toBe('Level 2');
        expect(barTitleOf(view, { document: 'Doc', manifestName: 'M' })).toBe('Doc');
        expect(barTitleOf(view, { manifestName: 'M' })).toBe('Quiz');
        expect(barTitleOf({ ...view, title: undefined }, { manifestName: 'M' })).toBe('M');
        expect(barTitleOf({ ...view, title: undefined }, {})).toBe('quiz.apps.chatic.io');
    });

    it('reads a manifest field by field, ignoring what it does not know', () => {
        expect(readDesktopSubWebViewManifest({ manifestVersion: 1, name: ' Hub ', display: 'titled' })).toEqual({
            name: 'Hub',
            display: 'titled',
        });
        expect(readDesktopSubWebViewManifest({ manifestVersion: 1, name: 'x'.repeat(101), display: 'tv' })).toEqual({});
        expect(readDesktopSubWebViewManifest({ manifestVersion: 2, name: 'Hub' })).toEqual({});
        expect(readDesktopSubWebViewManifest({ manifestVersion: 1, display: 'immersive' })).toEqual({
            display: 'clean',
        });
        expect(readDesktopSubWebViewManifest({ manifestVersion: 1, display: 'standard' })).toEqual({
            display: 'titled',
        });
        expect(readDesktopSubWebViewManifest({ manifestVersion: 1, display: 'fullscreen' })).toEqual({
            display: 'clean',
        });
        expect(readDesktopSubWebViewManifest(null)).toEqual({});
    });
});

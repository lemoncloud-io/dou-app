import {
    isSubWebViewAppLinkAttempt,
    subWebViewAppLinkOfOrigin,
    subWebViewNavigatePath,
    subWebViewPageUrlOfAppLink,
    subWebViewPageUrlOfNavigatePath,
    subWebViewPageUrlOfWebPath,
} from './subWebViewLink';

describe('subWebViewPageUrlOfAppLink', () => {
    it.each([
        ['https://app.chatic.io/apps/quiz', 'https://quiz.apps.chatic.io/'],
        ['https://app.chatic.io/apps/quiz/', 'https://quiz.apps.chatic.io/'],
        ['https://app.chatic.io/apps/quiz/level/3?seed=7#top', 'https://quiz.apps.chatic.io/level/3?seed=7#top'],
        ['https://app.chatic.io/apps/quiz?seed=7', 'https://quiz.apps.chatic.io/?seed=7'],
        ['https://app-dev.chatic.io/apps/sample', 'https://sample.apps-dev.chatic.io/'],
        ['https://app-dev.chatic.io/apps/dou-raise/play', 'https://dou-raise.apps-dev.chatic.io/play'],
    ])('opens %s as %s', (link, page) => {
        expect(subWebViewPageUrlOfAppLink(link)).toBe(page);
    });

    it.each([
        ['another host', 'https://evil.example/apps/quiz'],
        ['userinfo', 'https://evil.example@app.chatic.io/apps/quiz'],
        ['a port', 'https://app.chatic.io:8443/apps/quiz'],
        ['http', 'http://app.chatic.io/apps/quiz'],
        ['no label', 'https://app.chatic.io/apps/'],
        ['a label with a dot', 'https://app.chatic.io/apps/a.b/x'],
        ['an upper-case label', 'https://app.chatic.io/apps/Quiz'],
        ['a label that ends in a hyphen', 'https://app.chatic.io/apps/quiz-'],
        ['another path', 'https://app.chatic.io/s?code=x'],
        ['a lookalike prefix', 'https://app.chatic.io/appsx/quiz'],
    ])('is no app link with %s', (_label, link) => {
        expect(subWebViewPageUrlOfAppLink(link)).toBeNull();
    });
});

describe('subWebViewAppLinkOfOrigin', () => {
    it.each([
        ['https://quiz.apps.chatic.io', 'https://app.chatic.io/apps/quiz'],
        ['https://sample.apps-dev.chatic.io', 'https://app-dev.chatic.io/apps/sample'],
    ])('links %s as %s', (origin, link) => {
        expect(subWebViewAppLinkOfOrigin(origin)).toBe(link);
    });

    it.each([
        'https://apps.chatic.io',
        'https://a.b.apps.chatic.io',
        'https://quiz.example.com',
        'http://quiz.apps.chatic.io',
    ])('has no link for %s', origin => {
        expect(subWebViewAppLinkOfOrigin(origin)).toBeNull();
    });

    it('round-trips with the page a link opens', () => {
        const link = subWebViewAppLinkOfOrigin('https://quiz.apps.chatic.io');

        expect(subWebViewPageUrlOfAppLink(`${link}/level`)).toBe('https://quiz.apps.chatic.io/level');
    });
});

describe('the OnNavigate path', () => {
    it('carries the page URL there and back', () => {
        const page = 'https://quiz.apps.chatic.io/level/3?seed=7&x=a b#top';

        expect(subWebViewPageUrlOfNavigatePath(subWebViewNavigatePath(page))).toBe(page);
    });

    it.each([
        ['an ordinary route', '/chats/ch_1'],
        ['a route that only starts with the path', '/sub-webviews?url=https%3A%2F%2Fx'],
        ['no url', '/sub-webview?x=1'],
        ['a url that is not https', `/sub-webview?url=${encodeURIComponent('javascript:alert(1)')}`],
        ['a broken escape', '/sub-webview?url=%E0'],
        // The path can come through the app's custom scheme from any website.
        ['a site that is not a page', `/sub-webview?url=${encodeURIComponent('https://evil.example/')}`],
        ['userinfo before a page host', `/sub-webview?url=${encodeURIComponent('https://evil@quiz.apps.chatic.io/')}`],
    ])('is no page for %s', (_label, path) => {
        expect(subWebViewPageUrlOfNavigatePath(path)).toBeNull();
    });
});

describe('the first url', () => {
    it('is the one read, as URLSearchParams reads it', () => {
        const first = 'https://quiz.apps.chatic.io/a';
        const path = `/sub-webview?url=${encodeURIComponent(first)}&url=${encodeURIComponent('https://other.apps.chatic.io/')}`;

        expect(subWebViewPageUrlOfNavigatePath(path)).toBe(first);
    });
});

describe('isSubWebViewAppLinkAttempt', () => {
    it.each(['https://app.chatic.io/apps/Quiz', 'https://app.chatic.io/apps/', 'https://app-dev.chatic.io/apps'])(
        'counts %s as a page link, mapped or not',
        link => {
            expect(isSubWebViewAppLinkAttempt(link)).toBe(true);
        }
    );

    it.each(['https://app.chatic.io/appsx/quiz', 'https://app.chatic.io/s?code=x', 'https://evil.example/apps/quiz'])(
        'leaves %s alone',
        link => {
            expect(isSubWebViewAppLinkAttempt(link)).toBe(false);
        }
    );
});

describe('subWebViewPageUrlOfWebPath', () => {
    it('reads the path an app hands over', () => {
        const page = 'https://sample.apps-dev.chatic.io/';

        expect(subWebViewPageUrlOfWebPath(`/sub-webview?url=${encodeURIComponent(page)}`, 'prod')).toBe(page);
    });

    // An app before the mapping passes the link's path through; the web maps it with its own stage.
    it.each([
        ['prod', '/apps/quiz/level?x=1', 'https://quiz.apps.chatic.io/level?x=1'],
        ['dev', '/apps/sample', 'https://sample.apps-dev.chatic.io/'],
    ] as const)("maps an old app's %s path %s to %s", (stage, path, page) => {
        expect(subWebViewPageUrlOfWebPath(path, stage)).toBe(page);
    });

    it.each(['/chats/ch_1', '/apps/', '/apps/Quiz', '/appsx/quiz'])('leaves %s a route', path => {
        expect(subWebViewPageUrlOfWebPath(path, 'prod')).toBeNull();
    });
});

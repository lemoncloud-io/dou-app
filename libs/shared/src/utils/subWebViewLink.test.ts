import {
    isSubWebViewAppLinkAttempt,
    readSubWebViewAppLink,
    readSubWebViewLinkPath,
    subWebViewAppLinkOfId,
    subWebViewAppLinkOfOrigin,
    subWebViewLinkPath,
    subWebViewPageUrlOfNavigatePath,
} from './subWebViewLink';

describe('readSubWebViewAppLink', () => {
    it.each([
        ['https://app.chatic.io/apps/quiz', { stage: 'prod', appId: 'quiz', query: '' }],
        ['https://app.chatic.io/apps/quiz/', { stage: 'prod', appId: 'quiz', query: '' }],
        ['https://app.chatic.io/apps/quiz?level=3&seed=7', { stage: 'prod', appId: 'quiz', query: '?level=3&seed=7' }],
        ['https://app.chatic.io/apps/quiz/?seed=7', { stage: 'prod', appId: 'quiz', query: '?seed=7' }],
        ['https://app.chatic.io/apps/quiz?', { stage: 'prod', appId: 'quiz', query: '' }],
        ['https://app-dev.chatic.io/apps/dou-raise?x=a%20b', { stage: 'dev', appId: 'dou-raise', query: '?x=a%20b' }],
    ])('reads %s', (link, target) => {
        expect(readSubWebViewAppLink(link)).toEqual(target);
    });

    it.each([
        ['another host', 'https://evil.example/apps/quiz'],
        ['userinfo', 'https://evil.example@app.chatic.io/apps/quiz'],
        ['a port', 'https://app.chatic.io:8443/apps/quiz'],
        ['http', 'http://app.chatic.io/apps/quiz'],
        ['no id', 'https://app.chatic.io/apps/'],
        ['an id with a dot', 'https://app.chatic.io/apps/a.b'],
        ['an upper-case id', 'https://app.chatic.io/apps/Quiz'],
        ['an id that ends in a hyphen', 'https://app.chatic.io/apps/quiz-'],
        ['a path after the id', 'https://app.chatic.io/apps/quiz/level/3?seed=7'],
        ['a fragment', 'https://app.chatic.io/apps/quiz?seed=7#top'],
        ['another path', 'https://app.chatic.io/s?code=x'],
        ['a lookalike prefix', 'https://app.chatic.io/appsx/quiz'],
    ])('is no app link with %s', (_label, link) => {
        expect(readSubWebViewAppLink(link)).toBeNull();
    });
});

describe('the web path for a page link', () => {
    it('carries the id and the query there and back', () => {
        const target = { appId: 'quiz', query: '?level=3&seed=7' };

        expect(subWebViewLinkPath(target)).toBe('/apps/quiz?level=3&seed=7');
        expect(readSubWebViewLinkPath(subWebViewLinkPath(target))).toEqual(target);
    });

    it.each(['/apps/quiz', '/apps/quiz/'])('reads %s with no query', path => {
        expect(readSubWebViewLinkPath(path)).toEqual({ appId: 'quiz', query: '' });
    });

    it.each(['/chats/ch_1', '/apps/', '/apps/Quiz', '/appsx/quiz', '/apps/quiz/level?x=1', '/apps/quiz#top'])(
        'leaves %s a route',
        path => {
            expect(readSubWebViewLinkPath(path)).toBeNull();
        }
    );
});

describe('subWebViewAppLinkOfId', () => {
    it.each([
        ['prod', 'https://app.chatic.io/apps/quiz'],
        ['dev', 'https://app-dev.chatic.io/apps/quiz'],
    ] as const)('links an app for a %s build as %s', (stage, link) => {
        expect(subWebViewAppLinkOfId('quiz', stage)).toBe(link);
    });

    it('reads back as the same app', () => {
        expect(readSubWebViewAppLink(subWebViewAppLinkOfId('dou-raise', 'dev'))).toEqual({
            stage: 'dev',
            appId: 'dou-raise',
            query: '',
        });
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
});

describe('the path an app before app ids hands over', () => {
    it('carries the page URL', () => {
        const page = 'https://quiz.apps.chatic.io/level/3?seed=7&x=a b#top';

        expect(subWebViewPageUrlOfNavigatePath(`/sub-webview?url=${encodeURIComponent(page)}`)).toBe(page);
    });

    it('reads the first url, as URLSearchParams reads it', () => {
        const first = 'https://quiz.apps.chatic.io/a';
        const path = `/sub-webview?url=${encodeURIComponent(first)}&url=${encodeURIComponent('https://other.apps.chatic.io/')}`;

        expect(subWebViewPageUrlOfNavigatePath(path)).toBe(first);
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

describe('isSubWebViewAppLinkAttempt', () => {
    it.each([
        'https://app.chatic.io/apps/Quiz',
        'https://app.chatic.io/apps/',
        'https://app.chatic.io/apps/quiz/level',
        'https://app-dev.chatic.io/apps',
    ])('counts %s as a page link, well formed or not', link => {
        expect(isSubWebViewAppLinkAttempt(link)).toBe(true);
    });

    it.each(['https://app.chatic.io/appsx/quiz', 'https://app.chatic.io/s?code=x', 'https://evil.example/apps/quiz'])(
        'leaves %s alone',
        link => {
            expect(isSubWebViewAppLinkAttempt(link)).toBe(false);
        }
    );
});

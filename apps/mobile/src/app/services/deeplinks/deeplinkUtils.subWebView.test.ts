import { resolveDeepLink } from './deeplinkUtils';

jest.mock('react-native-config', () => ({
    default: { VITE_ENV: 'DEV' },
}));

// Same workaround as deeplinkUtils.test.ts: the barrel reaches web-only modules the CommonJS
// transform cannot parse, so the specifier points at the modules themselves.
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('../../../../../../libs/shared/src/utils/inviteLink'),
    ...jest.requireActual('../../../../../../libs/shared/src/utils/subWebViewLink'),
}));

// A sub WebView page's app link reaches the web as its own path, naming the app — the web resolves
// which page that is. Never mapped to a page here, and never a route of the web app.
describe('resolveDeepLink — sub WebView page link', () => {
    it.each([
        ['https://app.chatic.io/apps/quiz?level=3&seed=7', '/apps/quiz?level=3&seed=7'],
        ['https://app.chatic.io/apps/quiz/', '/apps/quiz'],
        ['https://app-dev.chatic.io/apps/sample', '/apps/sample'],
        // The landing site launches the app through its custom scheme when the OS did not.
        ['chatic://apps/quiz?seed=7', '/apps/quiz?seed=7'],
        ['chatic-dev://apps/sample', '/apps/sample'],
        // React Navigation hands a warm-start link as a bare path.
        ['/apps/quiz?seed=7', '/apps/quiz?seed=7'],
        // The query is the page's: its `target` is not the shell's native-routing marker.
        ['https://app.chatic.io/apps/quiz?target=native', '/apps/quiz?target=native'],
    ])('hands %s to the web as %s', (link, path) => {
        expect(resolveDeepLink(link)).toEqual({ kind: 'web', path });
    });

    it.each([
        'https://app.chatic.io/apps/Quiz',
        'https://app.chatic.io/apps/',
        'https://app-dev.chatic.io/apps',
        'https://app.chatic.io/apps/quiz/level?x=1',
        'https://app.chatic.io/apps/quiz#top',
        'chatic://apps/quiz/level',
    ])('refuses %s, which does not read as a page link, as an invalid link', link => {
        expect(resolveDeepLink(link)).toEqual(expect.objectContaining({ kind: 'invalid' }));
    });

    it('leaves another path on the link host a route', () => {
        expect(resolveDeepLink('https://app.chatic.io/appsx/quiz')).toEqual({ kind: 'web', path: '/appsx/quiz' });
    });
});

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

// A sub WebView page's app link reaches the web as the one path it opens a page for, carrying the
// page's own URL — never as a route of the web app.
describe('resolveDeepLink — sub WebView page link', () => {
    it.each([
        ['https://app.chatic.io/apps/quiz/level?x=1', 'https://quiz.apps.chatic.io/level?x=1'],
        ['https://app-dev.chatic.io/apps/sample', 'https://sample.apps-dev.chatic.io/'],
    ])('turns %s into the request to open %s', (link, page) => {
        expect(resolveDeepLink(link)).toEqual({ kind: 'web', path: `/sub-webview?url=${encodeURIComponent(page)}` });
    });

    it.each(['https://app.chatic.io/apps/Quiz', 'https://app.chatic.io/apps/', 'https://app-dev.chatic.io/apps'])(
        'refuses %s, which names no page, as an invalid link',
        link => {
            expect(resolveDeepLink(link)).toEqual(expect.objectContaining({ kind: 'invalid' }));
        }
    );

    it('leaves another path on the link host a route', () => {
        expect(resolveDeepLink('https://app.chatic.io/appsx/quiz')).toEqual({ kind: 'web', path: '/appsx/quiz' });
    });
});

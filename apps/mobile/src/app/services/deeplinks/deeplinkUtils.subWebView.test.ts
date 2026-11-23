import { resolveDeepLink } from './deeplinkUtils';

jest.mock('react-native-config', () => ({
    default: { VITE_ENV: 'DEV' },
}));

jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('../../../../../../libs/shared/src/utils/inviteLink'),
    ...jest.requireActual('../../../../../../libs/shared/src/utils/subWebViewLink'),
}));

describe('resolveDeepLink — sub WebView page link', () => {
    it.each([
        ['https://app.chatic.io/apps/quiz?level=3&seed=7', '/apps/quiz?level=3&seed=7'],
        ['https://app.chatic.io/apps/quiz/', '/apps/quiz'],
        ['https://app-dev.chatic.io/apps/sample', '/apps/sample'],
        ['chatic://apps/quiz?seed=7', '/apps/quiz?seed=7'],
        ['chatic-dev://apps/sample', '/apps/sample'],
        ['/apps/quiz?seed=7', '/apps/quiz?seed=7'],
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

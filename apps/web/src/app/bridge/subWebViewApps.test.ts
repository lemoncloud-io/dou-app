import { resolveSubWebViewAppUrl } from './subWebViewApps';

describe('resolveSubWebViewAppUrl', () => {
    it("opens a known app at its root with the link's query", async () => {
        await expect(resolveSubWebViewAppUrl({ appId: 'dou-raise', query: '?level=3&seed=7' }, 'prod')).resolves.toBe(
            'https://dou-raise.apps.chatic.io/?level=3&seed=7'
        );
    });

    it('opens it at its root when the link has no query', async () => {
        await expect(resolveSubWebViewAppUrl({ appId: 'dou-raise', query: '' }, 'prod')).resolves.toBe(
            'https://dou-raise.apps.chatic.io/'
        );
    });

    it("opens the build's own stage of the app", async () => {
        await expect(resolveSubWebViewAppUrl({ appId: 'dou-raise', query: '' }, 'dev')).resolves.toBe(
            'https://dou-raise.apps-dev.chatic.io/'
        );
    });

    it.each(['quiz', 'constructor', 'toString'])('has no page for %s', async appId => {
        await expect(resolveSubWebViewAppUrl({ appId, query: '' }, 'prod')).resolves.toBeNull();
    });
});

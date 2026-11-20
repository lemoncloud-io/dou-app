import { miniAppHubUrl, resolveSubWebViewAppUrl } from './subWebViewApps';

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

    it.each([
        ['prod', 'https://dou-closer-word.apps.chatic.io/'],
        ['dev', 'https://dou-closer-word.apps-dev.chatic.io/'],
    ] as const)('opens Closer Word on its %s host', async (stage, url) => {
        await expect(resolveSubWebViewAppUrl({ appId: 'dou-closer-word', query: '' }, stage)).resolves.toBe(url);
    });

    it.each([
        ['prod', 'https://dou-sky.apps.chatic.io/'],
        ['dev', 'https://dou-sky.apps-dev.chatic.io/'],
    ] as const)('opens Sky 45 on its %s host', async (stage, url) => {
        await expect(resolveSubWebViewAppUrl({ appId: 'dou-sky', query: '' }, stage)).resolves.toBe(url);
    });

    it.each(['quiz', 'constructor', 'toString'])('has no page for %s', async appId => {
        await expect(resolveSubWebViewAppUrl({ appId, query: '' }, 'prod')).resolves.toBeNull();
    });
});

describe('miniAppHubUrl', () => {
    // The root of the apps domain, the hub's own first-party origin, not a page under it.
    it.each([
        ['prod', 'https://apps.chatic.io/'],
        ['dev', 'https://apps-dev.chatic.io/'],
    ] as const)('is the %s hub', (stage, url) => {
        expect(miniAppHubUrl(stage)).toBe(url);
    });
});

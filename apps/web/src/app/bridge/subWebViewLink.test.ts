import { logger } from '@chatic/bridges';

import { openSubWebView } from './subWebView';
import { openSubWebViewTarget, subWebViewTargetOfUrl } from './subWebViewLink';

jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('./subWebView', () => ({ openSubWebView: jest.fn() }));

let mockDevBuild = false;
jest.mock('../utils/buildEnv', () => ({ isDevBuild: () => mockDevBuild }));

describe('subWebViewTargetOfUrl', () => {
    beforeEach(() => {
        mockDevBuild = false;
    });

    it.each([
        ['the production app link', 'https://app.chatic.io/apps/dou-raise', { appId: 'dou-raise', query: '' }],
        ['the development app link', 'https://app-dev.chatic.io/apps/dou-raise', { appId: 'dou-raise', query: '' }],
        ['an app link with a query', 'https://app.chatic.io/apps/quiz?level=3', { appId: 'quiz', query: '?level=3' }],
    ])('names the app for %s', (_name, url, link) => {
        expect(subWebViewTargetOfUrl(url)).toEqual({ link });
    });

    it.each([
        ['a production page', 'https://dou-raise.apps.chatic.io/'],
        ['a page with a path and a query', 'https://quiz.apps.chatic.io/level?x=1'],
    ])('keeps the address of %s in a production build', (_name, url) => {
        expect(subWebViewTargetOfUrl(url)).toEqual({ pageUrl: url });
    });

    it('keeps the address of a development page in a development build', () => {
        mockDevBuild = true;

        expect(subWebViewTargetOfUrl('https://dou-raise.apps-dev.chatic.io/')).toEqual({
            pageUrl: 'https://dou-raise.apps-dev.chatic.io/',
        });
    });

    it.each([
        ['a development page in a production build', false, 'https://dou-raise.apps-dev.chatic.io/'],
        ['a production page in a development build', true, 'https://dou-raise.apps.chatic.io/'],
    ])('names nothing for %s', (_name, dev, url) => {
        mockDevBuild = dev;

        expect(subWebViewTargetOfUrl(url)).toBeNull();
    });

    it("names the app for the other stage's app link too", () => {
        mockDevBuild = true;

        expect(subWebViewTargetOfUrl('https://app.chatic.io/apps/dou-raise')).toEqual({
            link: { appId: 'dou-raise', query: '' },
        });
    });

    it.each([
        ['an ordinary site', 'https://example.com/'],
        ['the mini app hub, which is no page', 'https://apps.chatic.io/'],
        ['an invite link on the app-link host', 'https://app.chatic.io/s?code=abc'],
        ['an app link with a path after the id', 'https://app.chatic.io/apps/quiz/level'],
        ['a page over plain http', 'http://quiz.apps.chatic.io/'],
        ['a host that only starts like a page', 'https://quiz.apps.chatic.io.evil.example/'],
    ])('names nothing for %s', (_name, url) => {
        expect(subWebViewTargetOfUrl(url)).toBeNull();
    });
});

describe('openSubWebViewTarget', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockDevBuild = false;
        (openSubWebView as jest.Mock).mockResolvedValue({ via: 'subWebView', viewId: 'v1' });
    });

    it("opens the app a link names at this build's stage, with the link's query", async () => {
        await expect(openSubWebViewTarget({ link: { appId: 'dou-raise', query: '?seed=7' } })).resolves.toBe('opened');

        expect(openSubWebView).toHaveBeenCalledWith({
            url: 'https://dou-raise.apps.chatic.io/?seed=7',
            appId: 'dou-raise',
        });
    });

    it('opens the development page of the app in a development build', async () => {
        mockDevBuild = true;

        await openSubWebViewTarget({ link: { appId: 'dou-raise', query: '' } });

        expect(openSubWebView).toHaveBeenCalledWith({
            url: 'https://dou-raise.apps-dev.chatic.io/',
            appId: 'dou-raise',
        });
    });

    it('opens a page address as it is, naming no app', async () => {
        await openSubWebViewTarget({ pageUrl: 'https://dou-raise.apps.chatic.io/' });

        expect(openSubWebView).toHaveBeenCalledWith({ url: 'https://dou-raise.apps.chatic.io/' });
    });

    it('opens nothing for an app this stage does not know', async () => {
        await expect(openSubWebViewTarget({ link: { appId: 'unknown', query: '' } })).resolves.toBe('unknownApp');

        expect(openSubWebView).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith('router.sub_webview_app_unknown', expect.any(String), {
            appId: 'unknown',
        });
    });

    it('settles and logs when the shell refuses the page', async () => {
        (openSubWebView as jest.Mock).mockRejectedValue(new Error('ALREADY_OPEN'));

        await expect(openSubWebViewTarget({ pageUrl: 'https://quiz.apps.chatic.io/' })).resolves.toBe('refused');

        expect(logger.warn).toHaveBeenCalledWith('router.sub_webview_link_refused', expect.any(String), {
            pageUrl: 'https://quiz.apps.chatic.io/',
            error: expect.any(Error),
        });
    });
});

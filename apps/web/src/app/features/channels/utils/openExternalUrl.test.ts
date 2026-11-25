import { openSubWebViewTarget } from '../../../bridge/subWebViewLink';
import { openExternalUrl } from './openExternalUrl';

const mockIsNative = jest.fn();
const mockOpenUrl = jest.fn();
jest.mock('@chatic/runtime-react', () => {
    const testing = require('@chatic/runtime-react/testing');
    return testing.fakeRuntimeModule({
        get links() {
            return mockIsNative()
                ? {
                      ...testing.browserLinks(),
                      kind: 'shell',
                      openUrl: (url: string) => mockOpenUrl(url),
                      subWebView: { openScope: jest.fn(), open: jest.fn() },
                  }
                : testing.browserLinks();
        },
    });
});

let mockSupportsSubWebView = true;
jest.mock('../../../bridge/shellCapabilities', () => ({
    shellCapabilities: { supports: (type: string) => type === 'OpenSubWebView' && mockSupportsSubWebView },
}));

jest.mock('../../../bridge/subWebViewLink', () => ({
    ...jest.requireActual('../../../bridge/subWebViewLink'),
    openSubWebViewTarget: jest.fn(),
}));

jest.mock('../../../utils/buildEnv', () => ({ isDevBuild: () => false }));

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('openExternalUrl', () => {
    const open = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        mockSupportsSubWebView = true;
        (openSubWebViewTarget as jest.Mock).mockResolvedValue('opened');
        Object.defineProperty(window, 'open', { configurable: true, value: open });
    });

    it('hands the URL to the native shell inside the app', () => {
        mockIsNative.mockReturnValue(true);

        openExternalUrl('https://example.com/a');

        expect(mockOpenUrl).toHaveBeenCalledWith('https://example.com/a');
        expect(openSubWebViewTarget).not.toHaveBeenCalled();
        expect(open).not.toHaveBeenCalled();
    });

    it('opens a new tab in a plain browser', () => {
        mockIsNative.mockReturnValue(false);

        openExternalUrl('https://example.com/a');

        expect(open).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener,noreferrer');
        expect(mockOpenUrl).not.toHaveBeenCalled();
    });

    describe('a mini app link', () => {
        beforeEach(() => mockIsNative.mockReturnValue(true));

        it('opens the app a link names in the sub WebView, not the OS browser', () => {
            openExternalUrl('https://app.chatic.io/apps/dou-raise');

            expect(openSubWebViewTarget).toHaveBeenCalledWith({ link: { appId: 'dou-raise', query: '' } });
            expect(mockOpenUrl).not.toHaveBeenCalled();
        });

        it("opens a page's own address in the sub WebView", () => {
            openExternalUrl('https://dou-raise.apps.chatic.io/');

            expect(openSubWebViewTarget).toHaveBeenCalledWith({ pageUrl: 'https://dou-raise.apps.chatic.io/' });
            expect(mockOpenUrl).not.toHaveBeenCalled();
        });

        it('goes to the OS when the link names an app this build does not know', async () => {
            (openSubWebViewTarget as jest.Mock).mockResolvedValue('unknownApp');

            openExternalUrl('https://app.chatic.io/apps/unknown');
            await settle();

            expect(mockOpenUrl).toHaveBeenCalledWith('https://app.chatic.io/apps/unknown');
        });

        it('stays put when the shell refuses the page', async () => {
            (openSubWebViewTarget as jest.Mock).mockResolvedValue('refused');

            openExternalUrl('https://app.chatic.io/apps/dou-raise');
            await settle();

            expect(mockOpenUrl).not.toHaveBeenCalled();
        });

        it("hands another stage's page address to the OS", () => {
            openExternalUrl('https://dou-raise.apps-dev.chatic.io/');

            expect(mockOpenUrl).toHaveBeenCalledWith('https://dou-raise.apps-dev.chatic.io/');
            expect(openSubWebViewTarget).not.toHaveBeenCalled();
        });

        it('goes to the OS as before in an app without the sub WebView', () => {
            mockSupportsSubWebView = false;

            openExternalUrl('https://app.chatic.io/apps/dou-raise');

            expect(mockOpenUrl).toHaveBeenCalledWith('https://app.chatic.io/apps/dou-raise');
            expect(openSubWebViewTarget).not.toHaveBeenCalled();
        });
    });

    it('opens a mini app link in a new tab in a plain browser', () => {
        mockIsNative.mockReturnValue(false);

        openExternalUrl('https://app.chatic.io/apps/dou-raise');

        expect(open).toHaveBeenCalledWith('https://app.chatic.io/apps/dou-raise', '_blank', 'noopener,noreferrer');
        expect(openSubWebViewTarget).not.toHaveBeenCalled();
    });
});

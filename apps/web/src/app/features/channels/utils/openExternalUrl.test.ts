import { appBridge } from '../../../bridge';
import { openSubWebViewTarget } from '../../../bridge/subWebViewLink';
import { openExternalUrl } from './openExternalUrl';

const mockIsNative = jest.fn();
// Who takes the page's links, as the host's `links` port says.
jest.mock('@chatic/host', () => ({
    host: {
        get ports() {
            return { links: { kind: mockIsNative() ? 'app' : 'page' } };
        },
    },
}));

jest.mock('../../../bridge', () => ({
    appBridge: { openURL: jest.fn() },
}));

let mockSupportsSubWebView = true;
jest.mock('../../../bridge/shellCapabilities', () => ({
    shellCapabilities: { supports: (type: string) => type === 'OpenSubWebView' && mockSupportsSubWebView },
}));

// The real reading of a URL, so these tests say which links count; only the opening is faked.
jest.mock('../../../bridge/subWebViewLink', () => ({
    ...jest.requireActual('../../../bridge/subWebViewLink'),
    openSubWebViewTarget: jest.fn(),
}));

// The production build: its page domain is `apps.chatic.io`.
jest.mock('../../../utils/buildEnv', () => ({ isDevBuild: () => false }));

// Lets the `.then` after an opening run.
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

        expect(appBridge.openURL).toHaveBeenCalledWith('https://example.com/a');
        expect(openSubWebViewTarget).not.toHaveBeenCalled();
        expect(open).not.toHaveBeenCalled();
    });

    it('opens a new tab in a plain browser', () => {
        mockIsNative.mockReturnValue(false);

        openExternalUrl('https://example.com/a');

        expect(open).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener,noreferrer');
        expect(appBridge.openURL).not.toHaveBeenCalled();
    });

    describe('a mini app link', () => {
        beforeEach(() => mockIsNative.mockReturnValue(true));

        it('opens the app a link names in the sub WebView, not the OS browser', () => {
            openExternalUrl('https://app.chatic.io/apps/dou-raise');

            expect(openSubWebViewTarget).toHaveBeenCalledWith({ link: { appId: 'dou-raise', query: '' } });
            expect(appBridge.openURL).not.toHaveBeenCalled();
        });

        // A message sent before its page shared the app link carries the page's own address.
        it("opens a page's own address in the sub WebView", () => {
            openExternalUrl('https://dou-raise.apps.chatic.io/');

            expect(openSubWebViewTarget).toHaveBeenCalledWith({ pageUrl: 'https://dou-raise.apps.chatic.io/' });
            expect(appBridge.openURL).not.toHaveBeenCalled();
        });

        // A tap the user asked for opens something: the app link, through the OS, as before.
        it('goes to the OS when the link names an app this build does not know', async () => {
            (openSubWebViewTarget as jest.Mock).mockResolvedValue('unknownApp');

            openExternalUrl('https://app.chatic.io/apps/unknown');
            await settle();

            expect(appBridge.openURL).toHaveBeenCalledWith('https://app.chatic.io/apps/unknown');
        });

        // A refusal is the shell's answer about this page, logged; the OS would show it outside the app.
        it('stays put when the shell refuses the page', async () => {
            (openSubWebViewTarget as jest.Mock).mockResolvedValue('refused');

            openExternalUrl('https://app.chatic.io/apps/dou-raise');
            await settle();

            expect(appBridge.openURL).not.toHaveBeenCalled();
        });

        it("hands another stage's page address to the OS", () => {
            openExternalUrl('https://dou-raise.apps-dev.chatic.io/');

            expect(appBridge.openURL).toHaveBeenCalledWith('https://dou-raise.apps-dev.chatic.io/');
            expect(openSubWebViewTarget).not.toHaveBeenCalled();
        });

        it('goes to the OS as before in an app without the sub WebView', () => {
            mockSupportsSubWebView = false;

            openExternalUrl('https://app.chatic.io/apps/dou-raise');

            expect(appBridge.openURL).toHaveBeenCalledWith('https://app.chatic.io/apps/dou-raise');
            expect(openSubWebViewTarget).not.toHaveBeenCalled();
        });
    });

    // The browser has no sub WebView: a link there opens a tab, whatever it names.
    it('opens a mini app link in a new tab in a plain browser', () => {
        mockIsNative.mockReturnValue(false);

        openExternalUrl('https://app.chatic.io/apps/dou-raise');

        expect(open).toHaveBeenCalledWith('https://app.chatic.io/apps/dou-raise', '_blank', 'noopener,noreferrer');
        expect(openSubWebViewTarget).not.toHaveBeenCalled();
    });
});

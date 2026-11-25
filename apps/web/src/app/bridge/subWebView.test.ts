import type { OnWebAppReadyPayload } from '@chatic/bridge-messages';

import { shellCapabilities } from './shellCapabilities';
import { openSubWebView } from './subWebView';

let mockNative = true;
const openURL = jest.fn();
const requestOpen = jest.fn();
jest.mock('@chatic/runtime-react', () => {
    const testing = require('@chatic/runtime-react/testing');
    return testing.fakeRuntimeModule({
        get links() {
            return mockNative
                ? {
                      ...testing.browserLinks(),
                      kind: 'shell',
                      openUrl: (...args: unknown[]) => openURL(...args),
                      subWebView: { openScope: jest.fn(), open: (...args: unknown[]) => requestOpen(...args) },
                  }
                : testing.browserLinks();
        },
    });
});

const report = (supportedWebMessages: string[]): OnWebAppReadyPayload => ({
    protocolVersion: '2.6.0',
    supportedWebMessages,
    supportedAppMessages: [],
});

const URL_ = 'https://app.chatic.io/notice';

describe('openSubWebView', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockNative = true;
        shellCapabilities.reset();
    });

    it('asks the shell when its handshake lists OpenSubWebView', async () => {
        shellCapabilities.setReport(report(['OpenSubWebView']));
        requestOpen.mockResolvedValue('view-1');

        await expect(openSubWebView({ url: URL_, title: 'Notice' })).resolves.toEqual({
            via: 'subWebView',
            viewId: 'view-1',
        });
        expect(requestOpen).toHaveBeenCalledWith(URL_, { title: 'Notice', params: undefined, appId: undefined });
        expect(openURL).not.toHaveBeenCalled();
    });

    it('passes params on to the shell', async () => {
        shellCapabilities.setReport(report(['OpenSubWebView']));
        requestOpen.mockResolvedValue('view-1');

        await openSubWebView({ url: URL_, params: { orderId: 7 } });

        expect(requestOpen).toHaveBeenCalledWith(URL_, expect.objectContaining({ params: { orderId: 7 } }));
    });

    it('passes the app id on to the shell', async () => {
        shellCapabilities.setReport(report(['OpenSubWebView']));
        requestOpen.mockResolvedValue('view-1');

        await openSubWebView({ url: URL_, appId: 'quiz' });

        expect(requestOpen).toHaveBeenCalledWith(URL_, expect.objectContaining({ appId: 'quiz' }));
    });

    it('hands the page to the OS browser when the handshake does not list it', async () => {
        shellCapabilities.setReport(report(['OpenURL']));

        await expect(openSubWebView({ url: URL_ })).resolves.toEqual({ via: 'external' });
        expect(openURL).toHaveBeenCalledWith(URL_);
        expect(requestOpen).not.toHaveBeenCalled();
    });

    it('takes the OS-browser path, too, before the handshake has answered', async () => {
        await expect(openSubWebView({ url: URL_ })).resolves.toEqual({ via: 'external' });
    });

    it('opens a new tab in a plain browser', async () => {
        mockNative = false;
        const open = jest.spyOn(window, 'open').mockImplementation(() => null);

        await expect(openSubWebView({ url: URL_ })).resolves.toEqual({ via: 'browser' });
        expect(open).toHaveBeenCalledWith(URL_, '_blank', 'noopener,noreferrer');
        expect(openURL).not.toHaveBeenCalled();
        open.mockRestore();
    });

    it("rejects with the shell's refusal instead of falling back", async () => {
        shellCapabilities.setReport(report(['OpenSubWebView']));
        requestOpen.mockRejectedValue(Object.assign(new Error('not allowed'), { code: 'NOT_ALLOWED' }));

        await expect(openSubWebView({ url: 'https://evil.example/' })).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
        expect(openURL).not.toHaveBeenCalled();
    });
});

describe('shellCapabilities.supports', () => {
    beforeEach(() => shellCapabilities.reset());

    it('reads the handshake, and is false without one', () => {
        expect(shellCapabilities.supports('OpenSubWebView')).toBe(false);

        shellCapabilities.setReport(report(['OpenSubWebView']));

        expect(shellCapabilities.supports('OpenSubWebView')).toBe(true);
        expect(shellCapabilities.supports('CloseSubWebView')).toBe(false);
    });
});

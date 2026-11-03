import type { OnWebAppReadyPayload } from '@chatic/bridge-messages';

import { shellCapabilities } from './shellCapabilities';
import { openSubWebView } from './subWebView';

let mockNative = true;
jest.mock('@chatic/bridges', () => ({ isNative: () => mockNative }));

const openURL = jest.fn();
const requestOpen = jest.fn();
jest.mock('./appBridge', () => ({
    appBridge: {
        openURL: (...args: unknown[]) => openURL(...args),
        openSubWebView: (...args: unknown[]) => requestOpen(...args),
    },
}));

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
        requestOpen.mockResolvedValue({ data: { viewId: 'view-1' } });

        await expect(openSubWebView({ url: URL_, title: 'Notice' })).resolves.toEqual({
            via: 'subWebView',
            viewId: 'view-1',
        });
        expect(requestOpen).toHaveBeenCalledWith(URL_, 'Notice', undefined);
        expect(openURL).not.toHaveBeenCalled();
    });

    it('passes params on to the shell', async () => {
        shellCapabilities.setReport(report(['OpenSubWebView']));
        requestOpen.mockResolvedValue({ data: { viewId: 'view-1' } });

        await openSubWebView({ url: URL_, params: { orderId: 7 } });

        expect(requestOpen).toHaveBeenCalledWith(URL_, undefined, { orderId: 7 });
    });

    // An app built before the sub WebView never meets the request: it would answer NOT_FOUND.
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

    // A refusal means this page asked for something the app will not show; hiding it behind the
    // OS browser would hide the bug.
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

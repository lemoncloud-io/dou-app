import { AppBridgeHost, JsonProtocol } from '@chatic/bridges';

import { DESKTOP_MAIN_HOST_OPTIONS, registerHandlers } from '../bridgeHandlers';
import { DesktopSubWebViewService } from './DesktopSubWebViewService';

jest.mock('../unfurl', () => ({ fetchUrlMetadata: jest.fn() }));

/**
 * The main window's handshake is what desktop-web reads before it offers anything that opens a sub
 * view: `OpenSubWebView` listed, and how far it opens. The web ships before the shell, so an older
 * shell — which lists neither — keeps the control hidden.
 */
describe("the main window's handshake", () => {
    const handshake = async () => {
        const sent: any[] = [];
        // Built the way createWindow builds it: the options constant, then the handlers.
        const host = new AppBridgeHost({
            sendToWeb: raw => sent.push(JsonProtocol.decode(raw)),
            ...DESKTOP_MAIN_HOST_OPTIONS,
        });
        registerHandlers(host, {
            showNotification: jest.fn(),
            awaitFcmToken: jest.fn(async () => ''),
            setBadgeCount: jest.fn(() => true),
            secureStorage: { get: jest.fn(), save: jest.fn(), clear: jest.fn() } as never,
            subWebView: new DesktopSubWebViewService(),
        });
        await host.handleMessage(
            JsonProtocol.encode({ type: 'WebAppReady', refId: 'ready', data: {} } as never) as string
        );
        return sent.find(message => message.refId === 'ready').data;
    };

    it('lists OpenSubWebView and CloseSubWebView, with OnSubWebViewClosed’s pair', async () => {
        const report = await handshake();

        expect(report.supportedWebMessages).toEqual(expect.arrayContaining(['OpenSubWebView', 'CloseSubWebView']));
        expect(report.supportedAppMessages).toEqual(expect.arrayContaining(['OnOpenSubWebView', 'OnCloseSubWebView']));
    });

    it("says it opens any https site, as 'anyHttps'", async () => {
        expect((await handshake()).subWebViewOpenScope).toBe('anyHttps');
    });

    it('lists none of the page-facing requests, which only the sub view’s own host answers', async () => {
        const report = await handshake();

        expect(report.supportedWebMessages).not.toContain('FinishSubWebView');
        expect(report.supportedWebMessages).not.toContain('SetSubWebViewTitle');
        expect(report.supportedWebMessages).not.toContain('ReportSubWebViewError');
    });
});

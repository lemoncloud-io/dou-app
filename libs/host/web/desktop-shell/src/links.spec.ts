import { logger } from '@chatic/bridges';

import type { DesktopShellBridge } from './bridge';
import { desktopShellLinks } from './links';

jest.mock('@chatic/bridges', () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const bridges = { request: jest.fn(), onEvent: jest.fn(), post: jest.fn() };
const shell = () => desktopShellLinks(bridges as unknown as DesktopShellBridge)({ kind: 'shell' });
const warn = logger.warn as jest.Mock;

const setClipboard = (writeText: jest.Mock | undefined) =>
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: writeText ? { writeText } : undefined,
    });

beforeEach(() => {
    bridges.request.mockReset();
    bridges.onEvent.mockReset();
    warn.mockReset();
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('desktopShellLinks — what the page does itself inside the desktop app', () => {
    const side = shell;

    it('opens a URL in a new window with no opener and no referrer', () => {
        const open = jest.spyOn(window, 'open').mockImplementation(() => null);

        side().openUrl('https://example.com/a');

        expect(open).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener,noreferrer');
        expect(bridges.request).not.toHaveBeenCalled();
    });

    it('copies with the Clipboard API, and rejects where there is none', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        setClipboard(writeText);
        await expect(side().copyText('hello')).resolves.toBe(true);
        expect(writeText).toHaveBeenCalledWith('hello');

        setClipboard(undefined);
        await expect(side().copyText('hello')).rejects.toThrow('Clipboard API is not available.');
    });

    it("has none of the phone app's members", () => {
        expect(side()).toMatchObject({ shareSheet: null, shareIntake: null, contacts: null, sms: null });
    });
});

describe('desktopShellLinks — the desktop app', () => {
    it("reads a link's preview through the main process", async () => {
        const answer = { success: true, url: 'https://example.com/a', title: 'A' };
        bridges.request.mockResolvedValue({ data: answer });

        await expect(shell().linkPreview?.fetch('https://example.com/a')).resolves.toBe(answer);
        expect(bridges.request).toHaveBeenCalledWith({
            type: 'FetchUrlMetadata',
            data: { url: 'https://example.com/a' },
        });
    });

    it("asks the handshake for the sub view's scope, and answers null when it says nothing", async () => {
        bridges.request.mockResolvedValueOnce({ data: { subWebViewOpenScope: 'anyHttps' } });
        await expect(shell().subWebView?.openScope()).resolves.toBe('anyHttps');
        expect(bridges.request).toHaveBeenCalledWith({ type: 'WebAppReady', data: {} });

        bridges.request.mockResolvedValueOnce({ data: {} });
        await expect(shell().subWebView?.openScope()).resolves.toBeNull();
    });

    it('reads a failed handshake as not offered, and leaves a trace', async () => {
        const error = new Error('TIMEOUT');
        bridges.request.mockRejectedValue(error);

        await expect(shell().subWebView?.openScope()).resolves.toBeNull();
        expect(warn).toHaveBeenCalledWith('BRIDGE', 'sub view handshake failed', { error });
    });

    it('opens a sub view with what the page passed, and answers its view id', async () => {
        bridges.request.mockResolvedValue({ data: { viewId: 'view-1' } });

        await expect(shell().subWebView?.open('https://shop.example/', { params: { cid: 'c1' } })).resolves.toBe(
            'view-1'
        );
        expect(bridges.request).toHaveBeenCalledWith({
            type: 'OpenSubWebView',
            data: { url: 'https://shop.example/', params: { cid: 'c1' } },
        });
    });

    it('rejects an opening the app answered without a view id', async () => {
        bridges.request.mockResolvedValue({ data: {} });

        await expect(shell().subWebView?.open('https://shop.example/')).rejects.toThrow(
            'OpenSubWebView answered without a viewId'
        );
    });

    it('hears every sub view the app closes, with what its page left, until unsubscribed', () => {
        const unsubscribe = jest.fn();
        bridges.onEvent.mockReturnValue(unsubscribe);
        const listener = jest.fn();

        const stop = shell().subWebView?.onClosed(listener);

        expect(bridges.onEvent).toHaveBeenCalledWith('OnSubWebViewClosed', expect.any(Function));
        const closed = { viewId: 'view-1', reason: 'page', result: { score: 3 } };
        bridges.onEvent.mock.calls[0][1]({ type: 'OnSubWebViewClosed', success: true, data: closed });
        expect(listener).toHaveBeenCalledWith(closed);

        stop?.();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});

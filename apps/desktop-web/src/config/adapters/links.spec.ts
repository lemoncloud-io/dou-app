import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WebHostFacts } from '@chatic/runtime-web';

const bridges = vi.hoisted(() => ({ request: vi.fn(), onEvent: vi.fn(), warn: vi.fn() }));
vi.mock('@chatic/bridges', () => ({
    webClient: { request: bridges.request, onEvent: bridges.onEvent },
    logger: { warn: bridges.warn, info: vi.fn(), error: vi.fn() },
}));

import { desktopLinks } from './links';

const facts = {} as WebHostFacts;
const shell = () => desktopLinks.shell({ kind: 'shell' }, facts);
const browser = () => desktopLinks.browser({ kind: 'browser' }, facts);

const setClipboard = (writeText: ReturnType<typeof vi.fn> | undefined) =>
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: writeText ? { writeText } : undefined,
    });

beforeEach(() => {
    bridges.request.mockReset();
    bridges.onEvent.mockReset();
    bridges.warn.mockReset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe.each([
    ['inside the desktop app', shell],
    ['in a browser tab', browser],
])('desktopLinks — what the page does itself %s', (_, side) => {
    it('opens a URL in a new window with no opener and no referrer', () => {
        const open = vi.spyOn(window, 'open').mockImplementation(() => null);

        side().openUrl('https://example.com/a');

        expect(open).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener,noreferrer');
        expect(bridges.request).not.toHaveBeenCalled();
    });

    it('copies with the Clipboard API, and rejects where there is none', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
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

describe('desktopLinks — the desktop app', () => {
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
        expect(bridges.warn).toHaveBeenCalledWith('BRIDGE', 'sub view handshake failed', { error });
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
        const unsubscribe = vi.fn();
        bridges.onEvent.mockReturnValue(unsubscribe);
        const listener = vi.fn();

        const stop = shell().subWebView?.onClosed(listener);

        expect(bridges.onEvent).toHaveBeenCalledWith('OnSubWebViewClosed', expect.any(Function));
        const closed = { viewId: 'view-1', reason: 'page', result: { score: 3 } };
        bridges.onEvent.mock.calls[0][1]({ type: 'OnSubWebViewClosed', success: true, data: closed });
        expect(listener).toHaveBeenCalledWith(closed);

        stop?.();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});

describe('desktopLinks — a browser tab', () => {
    it('reads no previews and has no sub view', () => {
        expect(browser()).toMatchObject({ kind: 'browser', linkPreview: null, subWebView: null });
    });
});

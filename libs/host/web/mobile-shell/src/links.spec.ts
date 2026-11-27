import { logger } from '@chatic/bridges';
import type { SubWebViewOpenScope } from '@chatic/ports';

import type { ShellBridge } from './bridge';
import { CONTACTS_READ_TIMEOUT_MS, mobileShellLinks, SHARE_INTAKE_FETCH_TIMEOUT_MS } from './links';

jest.mock('@chatic/bridges', () => ({
    ...jest.requireActual('@chatic/bridges'),
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const bridge = { post: jest.fn(), request: jest.fn(), onEvent: jest.fn() };
const subWebViewOpenScope = jest.fn<SubWebViewOpenScope | null, []>(() => null);

const shell = () =>
    mobileShellLinks({ bridge: bridge as unknown as ShellBridge, subWebViewOpenScope })({ kind: 'shell' });

beforeEach(() => {
    jest.resetAllMocks();
    subWebViewOpenScope.mockReturnValue(null);
});

describe('mobileShellLinks — the phone app takes the links', () => {
    it('hands a URL to the OS browser', () => {
        shell().openUrl('https://example.com/a');

        expect(bridge.post).toHaveBeenCalledWith({ type: 'OpenURL', data: { url: 'https://example.com/a' } });
    });

    it('copies through the app and answers true', async () => {
        bridge.request.mockResolvedValue({ type: 'OnCopyToClipboard', success: true });

        await expect(shell().copyText('hello')).resolves.toBe(true);
        expect(bridge.request).toHaveBeenCalledWith({ type: 'CopyToClipboard', data: { text: 'hello' } });
        expect(bridge.request.mock.calls[0]).toHaveLength(1);
    });

    it('answers a copy the app fails with false, logged, rather than rejecting', async () => {
        const error = new Error('handler not found');
        bridge.request.mockRejectedValue(error);

        await expect(shell().copyText('hello')).resolves.toBe(false);
        expect(logger.error).toHaveBeenCalledWith('CLIPBOARD', 'Native CopyToClipboard request failed', { error });
    });

    it('opens the share sheet for a link', () => {
        shell().shareSheet?.open('https://dou.link/abc');

        expect(bridge.post).toHaveBeenCalledWith({ type: 'OpenShareSheet', data: { url: 'https://dou.link/abc' } });
    });

    it('fetches a share, waiting as long as a slow copy takes, and releases it', async () => {
        const payload = { items: [], refused: [], text: 'hi' };
        bridge.request.mockResolvedValueOnce({ data: payload }).mockResolvedValueOnce({ data: {} });
        const { shareIntake } = shell();

        await expect(shareIntake?.fetch('s1')).resolves.toBe(payload);
        expect(bridge.request).toHaveBeenCalledWith(
            { type: 'FetchShareIntake', data: { id: 's1' } },
            { timeoutMs: SHARE_INTAKE_FETCH_TIMEOUT_MS }
        );
        expect(SHARE_INTAKE_FETCH_TIMEOUT_MS).toBe(10 * 60_000);

        await expect(shareIntake?.release('s1', { discard: true })).resolves.toBeUndefined();
        expect(bridge.request).toHaveBeenLastCalledWith({
            type: 'ReleaseShareIntake',
            data: { id: 's1', discard: true },
        });
        expect(bridge.request.mock.calls[1]).toHaveLength(1);
    });

    it("lets the app's error code through a failed fetch or release", async () => {
        const gone = Object.assign(new Error('GONE'), { code: 'GONE' });
        bridge.request.mockRejectedValue(gone);
        const { shareIntake } = shell();

        await expect(shareIntake?.fetch('s1')).rejects.toBe(gone);
        await expect(shareIntake?.release('s1', { discard: false })).rejects.toBe(gone);
    });

    it('reads the address book', async () => {
        const answer = { contacts: [], permission: 'granted' };
        bridge.request.mockResolvedValue({ data: answer });

        await expect(shell().contacts?.read()).resolves.toBe(answer);
        expect(bridge.request).toHaveBeenCalledWith(
            { type: 'GetContacts', data: {} },
            { timeoutMs: CONTACTS_READ_TIMEOUT_MS }
        );
        expect(CONTACTS_READ_TIMEOUT_MS).toBe(60_000);
    });

    it('opens the text composer and answers what the app said, or nothing from an app that says nothing', async () => {
        bridge.request.mockResolvedValueOnce({ data: { success: false } });
        await expect(shell().sms?.compose('01012345678', 'body')).resolves.toEqual({ success: false });
        expect(bridge.request).toHaveBeenCalledWith({
            type: 'SendSms',
            data: { phoneNumbers: '01012345678', message: 'body' },
        });
        expect(bridge.request.mock.calls[0]).toHaveLength(1);

        bridge.request.mockResolvedValueOnce({ type: 'OnSendSms', success: true });
        await expect(shell().sms?.compose('01012345678', 'body')).resolves.toBeUndefined();
    });

    it("reads a link's preview through the app", async () => {
        const answer = { success: true, url: 'https://example.com/a', title: 'A' };
        bridge.request.mockResolvedValue({ data: answer });

        await expect(shell().linkPreview?.fetch('https://example.com/a')).resolves.toBe(answer);
        expect(bridge.request).toHaveBeenCalledWith({
            type: 'FetchUrlMetadata',
            data: { url: 'https://example.com/a' },
        });
        expect(bridge.request.mock.calls[0]).toHaveLength(1);
    });

    it('opens a sub web view with what the page passed, and answers its view id', async () => {
        bridge.request.mockResolvedValue({ data: { viewId: 'view-1' } });
        const { subWebView } = shell();

        await expect(subWebView?.open('https://a.example/', { title: 'A', appId: 'quiz' })).resolves.toBe('view-1');
        expect(bridge.request).toHaveBeenCalledWith({
            type: 'OpenSubWebView',
            data: { url: 'https://a.example/', title: 'A', appId: 'quiz' },
        });
        expect(bridge.request.mock.calls[0]).toHaveLength(1);

        await subWebView?.open('https://a.example/');
        expect(bridge.request).toHaveBeenLastCalledWith({
            type: 'OpenSubWebView',
            data: { url: 'https://a.example/' },
        });
        expect(bridge.request.mock.calls[1]).toHaveLength(1);
    });

    it("reads the sub web view's scope from the boot handshake, null until it lands", async () => {
        const { subWebView } = shell();
        await expect(subWebView?.openScope()).resolves.toBeNull();

        subWebViewOpenScope.mockReturnValue('anyHttps');

        await expect(subWebView?.openScope()).resolves.toBe('anyHttps');
    });

    it('hears every sub web view the app closes, until unsubscribed', () => {
        const unsubscribe = jest.fn();
        bridge.onEvent.mockReturnValue(unsubscribe);
        const listener = jest.fn();

        const stop = shell().subWebView?.onClosed(listener);

        expect(bridge.onEvent).toHaveBeenCalledWith('OnSubWebViewClosed', expect.any(Function));
        const closed = { viewId: 'view-1', reason: 'page', result: { score: 3 } };
        bridge.onEvent.mock.calls[0][1]({ type: 'OnSubWebViewClosed', success: true, data: closed });
        expect(listener).toHaveBeenCalledWith(closed);

        stop?.();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});

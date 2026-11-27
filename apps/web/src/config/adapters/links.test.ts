import type { OnWebAppReadyPayload } from '@chatic/bridge-messages';
import { logger, webClient } from '@chatic/bridges';
import type { WebHostFacts } from '@chatic/runtime-hybrid-web';

import { appBridge } from '../../app/bridge/appBridge';
import { shellCapabilities } from '../../app/bridge/shellCapabilities';
import { SHARE_INTAKE_FETCH_TIMEOUT_MS, webLinks } from './links';

jest.mock('@chatic/bridges', () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
    webClient: { request: jest.fn(), onEvent: jest.fn() },
}));
jest.mock('../../app/bridge/appBridge', () => ({
    appBridge: {
        openURL: jest.fn(),
        copyClipBoard: jest.fn(),
        openShareSheet: jest.fn(),
        getContacts: jest.fn(),
        sendSms: jest.fn(),
        fetchUrlMetadata: jest.fn(),
        openSubWebView: jest.fn(),
    },
}));

const facts = {} as WebHostFacts;
const shell = () => webLinks.shell({ kind: 'shell' }, facts);
const browser = () => webLinks.browser({ kind: 'browser' }, facts);

const request = webClient.request as jest.Mock;
const onEvent = webClient.onEvent as jest.Mock;
const mocked = <K extends keyof typeof appBridge>(name: K) => appBridge[name] as unknown as jest.Mock;

const setClipboard = (writeText: jest.Mock | undefined) =>
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: writeText ? { writeText } : undefined,
    });

beforeEach(() => {
    jest.clearAllMocks();
    shellCapabilities.reset();
});

describe('webLinks — the phone app takes the links', () => {
    it('hands a URL to the OS browser', () => {
        shell().openUrl('https://example.com/a');

        expect(appBridge.openURL).toHaveBeenCalledWith('https://example.com/a');
    });

    it('copies through the app and answers true', async () => {
        mocked('copyClipBoard').mockResolvedValue({ type: 'OnCopyToClipboard', success: true });

        await expect(shell().copyText('hello')).resolves.toBe(true);
        expect(appBridge.copyClipBoard).toHaveBeenCalledWith('hello');
    });

    it('answers a copy the app fails with false, logged, rather than rejecting', async () => {
        const error = new Error('handler not found');
        mocked('copyClipBoard').mockRejectedValue(error);

        await expect(shell().copyText('hello')).resolves.toBe(false);
        expect(logger.error).toHaveBeenCalledWith('CLIPBOARD', 'Native CopyToClipboard request failed', { error });
    });

    it('opens the share sheet for a link', () => {
        shell().shareSheet?.open('https://dou.link/abc');

        expect(appBridge.openShareSheet).toHaveBeenCalledWith('https://dou.link/abc');
    });

    it('fetches a share, waiting as long as a slow copy takes, and releases it', async () => {
        const payload = { items: [], refused: [], text: 'hi' };
        request.mockResolvedValueOnce({ data: payload }).mockResolvedValueOnce({ data: {} });
        const { shareIntake } = shell();

        await expect(shareIntake?.fetch('s1')).resolves.toBe(payload);
        expect(request).toHaveBeenCalledWith(
            { type: 'FetchShareIntake', data: { id: 's1' } },
            { timeoutMs: SHARE_INTAKE_FETCH_TIMEOUT_MS }
        );
        expect(SHARE_INTAKE_FETCH_TIMEOUT_MS).toBe(10 * 60_000);

        await expect(shareIntake?.release('s1', { discard: true })).resolves.toBeUndefined();
        expect(request).toHaveBeenLastCalledWith({ type: 'ReleaseShareIntake', data: { id: 's1', discard: true } });
    });

    it("lets the app's error code through a failed fetch or release", async () => {
        const gone = Object.assign(new Error('GONE'), { code: 'GONE' });
        request.mockRejectedValue(gone);
        const { shareIntake } = shell();

        await expect(shareIntake?.fetch('s1')).rejects.toBe(gone);
        await expect(shareIntake?.release('s1', { discard: false })).rejects.toBe(gone);
    });

    it('reads the address book', async () => {
        const answer = { contacts: [], permission: 'granted' };
        mocked('getContacts').mockResolvedValue({ data: answer });

        await expect(shell().contacts?.read()).resolves.toBe(answer);
    });

    it('opens the text composer and answers what the app said, or nothing from an app that says nothing', async () => {
        mocked('sendSms').mockResolvedValueOnce({ data: { success: false } });
        await expect(shell().sms?.compose('01012345678', 'body')).resolves.toEqual({ success: false });
        expect(appBridge.sendSms).toHaveBeenCalledWith('01012345678', 'body');

        mocked('sendSms').mockResolvedValueOnce({ type: 'OnSendSms', success: true });
        await expect(shell().sms?.compose('01012345678', 'body')).resolves.toBeUndefined();
    });

    it("reads a link's preview through the app", async () => {
        const answer = { success: true, url: 'https://example.com/a', title: 'A' };
        mocked('fetchUrlMetadata').mockResolvedValue({ data: answer });

        await expect(shell().linkPreview?.fetch('https://example.com/a')).resolves.toBe(answer);
        expect(appBridge.fetchUrlMetadata).toHaveBeenCalledWith('https://example.com/a');
    });

    it('opens a sub web view with what the page passed, and answers its view id', async () => {
        mocked('openSubWebView').mockResolvedValue({ data: { viewId: 'view-1' } });
        const { subWebView } = shell();

        await expect(subWebView?.open('https://a.example/', { title: 'A', appId: 'quiz' })).resolves.toBe('view-1');
        expect(appBridge.openSubWebView).toHaveBeenCalledWith('https://a.example/', 'A', undefined, 'quiz');

        await subWebView?.open('https://a.example/');
        expect(appBridge.openSubWebView).toHaveBeenLastCalledWith(
            'https://a.example/',
            undefined,
            undefined,
            undefined
        );
    });

    it("reads the sub web view's scope from the boot handshake, null until it lands", async () => {
        const { subWebView } = shell();
        await expect(subWebView?.openScope()).resolves.toBeNull();

        shellCapabilities.setReport({
            protocolVersion: '2.22.0',
            supportedWebMessages: ['OpenSubWebView'],
            supportedAppMessages: [],
            subWebViewOpenScope: 'anyHttps',
        } as OnWebAppReadyPayload);

        await expect(subWebView?.openScope()).resolves.toBe('anyHttps');
    });

    it('hears every sub web view the app closes, until unsubscribed', () => {
        const unsubscribe = jest.fn();
        onEvent.mockReturnValue(unsubscribe);
        const listener = jest.fn();

        const stop = shell().subWebView?.onClosed(listener);

        expect(onEvent).toHaveBeenCalledWith('OnSubWebViewClosed', expect.any(Function));
        const closed = { viewId: 'view-1', reason: 'page', result: { score: 3 } };
        onEvent.mock.calls[0][1]({ type: 'OnSubWebViewClosed', success: true, data: closed });
        expect(listener).toHaveBeenCalledWith(closed);

        stop?.();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});

describe('webLinks — the page takes its own links', () => {
    it('opens a URL in a new tab with no opener and no referrer', () => {
        const open = jest.spyOn(window, 'open').mockImplementation(() => null);

        browser().openUrl('https://example.com/a');

        expect(open).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener,noreferrer');
        expect(appBridge.openURL).not.toHaveBeenCalled();
        open.mockRestore();
    });

    it('copies with the Clipboard API', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        setClipboard(writeText);

        await expect(browser().copyText('hello')).resolves.toBe(true);
        expect(writeText).toHaveBeenCalledWith('hello');
        expect(appBridge.copyClipBoard).not.toHaveBeenCalled();
    });

    it('rejects where there is no Clipboard API, or the write is refused', async () => {
        setClipboard(undefined);
        await expect(browser().copyText('hello')).rejects.toThrow('Clipboard API is not available.');

        setClipboard(jest.fn().mockRejectedValue(new Error('NotAllowedError')));
        await expect(browser().copyText('hello')).rejects.toThrow('NotAllowedError');
    });

    it("has none of an app's members", () => {
        expect(browser()).toMatchObject({
            kind: 'browser',
            shareSheet: null,
            shareIntake: null,
            contacts: null,
            sms: null,
            linkPreview: null,
            subWebView: null,
        });
    });
});

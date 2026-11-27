import type { DesktopShellBridge } from './bridge';
import { desktopShellPush } from './push';

const events: Record<string, (message: unknown) => void> = {};
const bridge = {
    post: jest.fn(),
    request: jest.fn(async (_message: unknown): Promise<unknown> => ({ success: true, data: { success: true } })),
    onEvent: jest.fn((type: string, handler: (message: unknown) => void) => {
        events[type] = handler;
        return () => delete events[type];
    }),
};
const asBridge = bridge as unknown as DesktopShellBridge;

const shell = () => desktopShellPush(asBridge)({ kind: 'shell' });

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => jest.clearAllMocks());

describe('desktopShellPush — the desktop app', () => {
    it('passes each notification and menu-bar link it hands over, skipping one without a payload', () => {
        const listener = jest.fn();
        const unsubscribe = shell().notifications?.onReceive(listener);
        const tap = { notification: { data: { deeplink: 'chatic-ui:settings' } } };

        events['OnReceiveNotification']?.({ type: 'OnReceiveNotification', data: tap });
        events['OnReceiveNotification']?.({ type: 'OnReceiveNotification' });
        unsubscribe?.();

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(tap);
        expect(events['OnReceiveNotification']).toBeUndefined();
    });

    it('reads the push token through FetchFcmToken, null when the answer has none', async () => {
        bridge.request.mockResolvedValueOnce({ success: true, data: { token: 'tok-1' } });
        await expect(shell().deviceToken?.fetch()).resolves.toBe('tok-1');
        expect(bridge.request).toHaveBeenCalledWith({ type: 'FetchFcmToken', data: {} });

        bridge.request.mockResolvedValueOnce({ success: true });
        await expect(shell().deviceToken?.fetch()).resolves.toBeNull();
    });

    it('passes a failed token request on, for the caller to decide what it means', async () => {
        bridge.request.mockRejectedValueOnce(new Error('NATIVE_NOT_SUPPORTED'));

        await expect(shell().deviceToken?.fetch()).rejects.toThrow('NATIVE_NOT_SUPPORTED');
    });

    it('announces each token it mints again, until unsubscribed', () => {
        const listener = jest.fn();
        const unsubscribe = shell().tokenRenewal?.onRenew(listener);

        events['OnFetchFcmToken']?.({ type: 'OnFetchFcmToken', data: { token: 'tok-2' } });
        unsubscribe?.();

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith();
        expect(events['OnFetchFcmToken']).toBeUndefined();
    });

    it('raises an OS banner through ShowNotification', () => {
        const banner = { title: '#general', body: 'Raine: hello', channelId: 'ch-1', deeplink: 'chatic://open' };

        shell().localBanner?.present(banner);

        expect(bridge.request).toHaveBeenCalledWith({ type: 'ShowNotification', data: banner });
    });

    it('drops a banner the app could not show, without throwing', async () => {
        bridge.request.mockRejectedValueOnce(new Error('NATIVE_NOT_SUPPORTED'));

        expect(() => shell().localBanner?.present({ title: 't', body: 'b' })).not.toThrow();
        await flush();
    });
});

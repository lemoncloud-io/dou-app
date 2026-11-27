import type { ShellBridge } from './bridge';
import { mobileShellPush } from './push';

const events: Record<string, (message: unknown) => void> = {};
const bridge = {
    post: jest.fn(),
    request: jest.fn(),
    onEvent: jest.fn((type: string, handler: (message: unknown) => void) => {
        events[type] = handler;
        return () => delete events[type];
    }),
};

const phone = () => mobileShellPush(bridge as unknown as ShellBridge)({ kind: 'shell' });

beforeEach(() => jest.clearAllMocks());

describe('mobileShellPush — the phone app', () => {
    it('raises no banner on request and announces no renewed token', () => {
        expect(phone()).toMatchObject({ kind: 'shell', tokenRenewal: null, localBanner: null });
    });

    it('passes each notification the app hands over, skipping one without a payload, until unsubscribed', () => {
        const listener = jest.fn();
        const unsubscribe = phone().notifications?.onReceive(listener);
        const payload = { notification: { title: 'DoU', data: { cid: 'cloud-1' } } };

        expect(bridge.onEvent).toHaveBeenCalledWith('OnReceiveNotification', expect.any(Function));
        events['OnReceiveNotification']?.({ type: 'OnReceiveNotification', data: payload });
        events['OnReceiveNotification']?.({ type: 'OnReceiveNotification' });
        unsubscribe?.();

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(payload);
        expect(events['OnReceiveNotification']).toBeUndefined();
    });

    it('reads the push token from the app, null when it answers without one', async () => {
        bridge.request.mockResolvedValueOnce({ data: { token: 'tok-1' } });
        await expect(phone().deviceToken?.fetch()).resolves.toBe('tok-1');
        expect(bridge.request).toHaveBeenCalledWith({ type: 'FetchFcmToken', data: {} });
        expect(bridge.request.mock.calls[0]).toHaveLength(1);

        bridge.request.mockResolvedValueOnce({ data: {} });
        await expect(phone().deviceToken?.fetch()).resolves.toBeNull();
    });

    it('passes a failed token request on, for the caller to decide what it means', async () => {
        bridge.request.mockRejectedValueOnce(new Error('FCM_ERROR'));

        await expect(phone().deviceToken?.fetch()).rejects.toThrow('FCM_ERROR');
    });
});

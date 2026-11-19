import type { WebHostFacts } from '@chatic/runtime-web';

import { appBridge } from '../../app/bridge/appBridge';
import { webPush } from './push';

// The phone app's events, captured so a test can play a notification back.
const mockEvents: Record<string, (message: unknown) => void> = {};
const mockOnEvent = jest.fn((type: string, handler: (message: unknown) => void) => {
    mockEvents[type] = handler;
    return () => delete mockEvents[type];
});
jest.mock('@chatic/bridges', () => ({
    ...jest.requireActual('@chatic/bridges'),
    webClient: { onEvent: (type: string, handler: (message: unknown) => void) => mockOnEvent(type, handler) },
}));
jest.mock('../../app/bridge/appBridge', () => ({ appBridge: { fetchFcmToken: jest.fn() } }));

const fetchFcmToken = appBridge.fetchFcmToken as jest.Mock;

// Neither side reads the facts; the implementations decide from the side alone.
const facts = {} as WebHostFacts;
const phone = () => webPush.shell({ kind: 'shell' }, facts);
const browser = () => webPush.browser({ kind: 'browser' }, facts);

beforeEach(() => jest.clearAllMocks());

describe('webPush — the phone app', () => {
    it('raises no banner on request and announces no renewed token', () => {
        expect(phone()).toMatchObject({ kind: 'shell', tokenRenewal: null, localBanner: null });
    });

    it('passes each notification the app hands over, skipping one without a payload, until unsubscribed', () => {
        const listener = jest.fn();
        const unsubscribe = phone().notifications?.onReceive(listener);
        const payload = { notification: { title: 'DoU', data: { cid: 'cloud-1' } } };

        mockEvents['OnReceiveNotification']?.({ type: 'OnReceiveNotification', data: payload });
        mockEvents['OnReceiveNotification']?.({ type: 'OnReceiveNotification' });
        unsubscribe?.();

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(payload);
        expect(mockEvents['OnReceiveNotification']).toBeUndefined();
    });

    it('reads the push token from the app, null when it answers without one', async () => {
        fetchFcmToken.mockResolvedValueOnce({ data: { token: 'tok-1' } });
        await expect(phone().deviceToken?.fetch()).resolves.toBe('tok-1');

        fetchFcmToken.mockResolvedValueOnce({ data: {} });
        await expect(phone().deviceToken?.fetch()).resolves.toBeNull();
    });

    it('passes a failed token request on, for the caller to decide what it means', async () => {
        fetchFcmToken.mockRejectedValueOnce(new Error('FCM_ERROR'));

        await expect(phone().deviceToken?.fetch()).rejects.toThrow('FCM_ERROR');
    });
});

describe('webPush — a browser', () => {
    it('receives nothing, holds no token and raises no banner', () => {
        expect(browser()).toEqual({
            kind: 'browser',
            notifications: null,
            deviceToken: null,
            tokenRenewal: null,
            localBanner: null,
        });
    });
});

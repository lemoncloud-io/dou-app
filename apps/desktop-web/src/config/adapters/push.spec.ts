import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WebHostFacts } from '@chatic/runtime-hybrid-web';

const { request, onEvent, events } = vi.hoisted(() => {
    const events: Record<string, (message: unknown) => void> = {};
    return {
        events,
        request: vi.fn(async (_message: unknown): Promise<unknown> => ({ success: true, data: {} })),
        onEvent: vi.fn((type: string, handler: (message: unknown) => void) => {
            events[type] = handler;
            return () => delete events[type];
        }),
    };
});
vi.mock('@chatic/bridges', () => ({ webClient: { request, onEvent } }));

import { desktopPush } from './push';

const facts = {} as WebHostFacts;
const shell = () => desktopPush.shell({ kind: 'shell' }, facts);
const browser = () => desktopPush.browser({ kind: 'browser' }, facts);

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => vi.clearAllMocks());

describe('desktopPush — the desktop app', () => {
    it('passes each notification and menu-bar link it hands over, skipping one without a payload', () => {
        const listener = vi.fn();
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
        request.mockResolvedValueOnce({ success: true, data: { token: 'tok-1' } });
        await expect(shell().deviceToken?.fetch()).resolves.toBe('tok-1');
        expect(request).toHaveBeenCalledWith({ type: 'FetchFcmToken', data: {} });

        request.mockResolvedValueOnce({ success: true });
        await expect(shell().deviceToken?.fetch()).resolves.toBeNull();
    });

    it('passes a failed token request on, for the caller to decide what it means', async () => {
        request.mockRejectedValueOnce(new Error('NATIVE_NOT_SUPPORTED'));

        await expect(shell().deviceToken?.fetch()).rejects.toThrow('NATIVE_NOT_SUPPORTED');
    });

    it('announces each token it mints again, until unsubscribed', () => {
        const listener = vi.fn();
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

        expect(request).toHaveBeenCalledWith({ type: 'ShowNotification', data: banner });
    });

    it('drops a banner the app could not show, without throwing', async () => {
        request.mockRejectedValueOnce(new Error('NATIVE_NOT_SUPPORTED'));

        expect(() => shell().localBanner?.present({ title: 't', body: 'b' })).not.toThrow();
        await flush();
    });
});

describe('desktopPush — a browser', () => {
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

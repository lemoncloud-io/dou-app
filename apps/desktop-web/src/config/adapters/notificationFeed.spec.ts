import { beforeEach, describe, expect, it, vi } from 'vitest';

const { onEvent, events } = vi.hoisted(() => {
    const events: Record<string, (message: unknown) => void> = {};
    return {
        events,
        onEvent: vi.fn((type: string, handler: (message: unknown) => void) => {
            events[type] = handler;
            return () => delete events[type];
        }),
    };
});
vi.mock('@chatic/bridges', () => ({ webClient: { onEvent } }));

import { desktopPush } from './push';
import { desktopSignIn } from './signIn';
import { onDesktopNotification } from './notificationFeed';

import type { WebHostFacts } from '@chatic/runtime-web';

beforeEach(() => vi.clearAllMocks());

describe('onDesktopNotification', () => {
    it('passes each payload the app sends on OnReceiveNotification, until unsubscribed', () => {
        const listener = vi.fn();
        const unsubscribe = onDesktopNotification(listener);
        const payload = { notification: { title: 'DoU', data: { deeplink: 'chatic-ui:settings' } } };

        expect(onEvent).toHaveBeenCalledWith('OnReceiveNotification', expect.any(Function));
        events['OnReceiveNotification']?.({ type: 'OnReceiveNotification', data: payload });
        unsubscribe();

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(payload);
        expect(events['OnReceiveNotification']).toBeUndefined();
    });

    it('drops a message without a payload, and an empty one, without throwing', () => {
        const listener = vi.fn();
        onDesktopNotification(listener);

        expect(() => events['OnReceiveNotification']?.({ type: 'OnReceiveNotification' })).not.toThrow();
        expect(() => events['OnReceiveNotification']?.(undefined)).not.toThrow();
        expect(listener).not.toHaveBeenCalled();
    });

    it('feeds push the whole payload and sign-in only its deeplink, from the same message', () => {
        const facts = {} as WebHostFacts;
        const notification = vi.fn();
        const deeplink = vi.fn();
        desktopPush.shell({ kind: 'shell' }, facts).notifications?.onReceive(notification);
        const pushHandler = events['OnReceiveNotification'];
        desktopSignIn.shell({ kind: 'shell', os: null }, facts).relayOAuth?.handoffLinks?.subscribe(deeplink);
        const signInHandler = events['OnReceiveNotification'];

        const payload = { notification: { data: { deeplink: 'chatic://oauth?code=c' } } };
        pushHandler?.({ type: 'OnReceiveNotification', data: payload });
        signInHandler?.({ type: 'OnReceiveNotification', data: payload });
        pushHandler?.({ type: 'OnReceiveNotification' });
        signInHandler?.({ type: 'OnReceiveNotification' });

        expect(notification.mock.calls).toEqual([[payload]]);
        expect(deeplink.mock.calls).toEqual([['chatic://oauth?code=c']]);
    });
});

import type { DesktopShellBridge } from './bridge';
import { desktopShellNotificationFeed } from './notificationFeed';
import { desktopShellPush } from './push';
import { desktopShellSignIn } from './signIn';

const events: Record<string, (message: unknown) => void> = {};
const bridge = {
    post: jest.fn(),
    request: jest.fn(),
    onEvent: jest.fn((type: string, handler: (message: unknown) => void) => {
        events[type] = handler;
        return () => delete events[type];
    }),
};
const asBridge = bridge as unknown as DesktopShellBridge;

beforeEach(() => jest.clearAllMocks());

describe('desktopShellNotificationFeed', () => {
    it('passes each payload the app sends on OnReceiveNotification, until unsubscribed', () => {
        const listener = jest.fn();
        const unsubscribe = desktopShellNotificationFeed(asBridge)(listener);
        const payload = { notification: { title: 'DoU', data: { deeplink: 'chatic-ui:settings' } } };

        expect(bridge.onEvent).toHaveBeenCalledWith('OnReceiveNotification', expect.any(Function));
        events['OnReceiveNotification']?.({ type: 'OnReceiveNotification', data: payload });
        unsubscribe();

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(payload);
        expect(events['OnReceiveNotification']).toBeUndefined();
    });

    it('drops a message without a payload, and an empty one, without throwing', () => {
        const listener = jest.fn();
        desktopShellNotificationFeed(asBridge)(listener);

        expect(() => events['OnReceiveNotification']?.({ type: 'OnReceiveNotification' })).not.toThrow();
        expect(() => events['OnReceiveNotification']?.(undefined)).not.toThrow();
        expect(listener).not.toHaveBeenCalled();
    });

    it('feeds push the whole payload and sign-in only its deeplink, from the same message', () => {
        const notification = jest.fn();
        const deeplink = jest.fn();
        desktopShellPush(asBridge)({ kind: 'shell' }).notifications?.onReceive(notification);
        const pushHandler = events['OnReceiveNotification'];
        desktopShellSignIn(asBridge)({ kind: 'shell', os: null }).relayOAuth?.handoffLinks?.subscribe(deeplink);
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

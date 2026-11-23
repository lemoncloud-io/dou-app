import type { AppBridgeHost } from '@chatic/bridges';

type EventHost = Pick<AppBridgeHost, 'pushEvent'>;

type ForwardedPush = { title?: string; body?: string; data: Record<string, string> };

export const pushDeeplink = (host: EventHost, url: string): void => {
    host.pushEvent({
        type: 'OnReceiveNotification',
        success: true,
        data: { notification: { data: { deeplink: url } } },
    });
};

export const pushFcmToken = (host: EventHost, token: string): void => {
    host.pushEvent({ type: 'OnFetchFcmToken', success: true, data: { token } });
};

export const pushFcmMessage = (host: EventHost, push: ForwardedPush): void => {
    host.pushEvent({
        type: 'OnReceiveNotification',
        success: true,
        data: { notification: { title: push.title, body: push.body, data: push.data } },
    });
};

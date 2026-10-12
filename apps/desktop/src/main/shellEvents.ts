import type { AppBridgeHost } from '@chatic/bridges';

/*
 * The app → web events the main process sends on its own initiative, apart from the updater's
 * OnUpdateStatus (updater.ts). They live here, free of electron, so the event contract tests can
 * load them; index.ts decides when each one fires.
 */

type EventHost = Pick<AppBridgeHost, 'pushEvent'>;

/** What it takes of fcm.ts's `FcmPush`, by shape: importing fcm.ts would bring electron along. */
type ForwardedPush = { title?: string; body?: string; data: Record<string, string> };

/**
 * Hands a deeplink to the web. The desktop sends no OnNavigate: the web routes the `deeplink` field
 * of an OnReceiveNotification, the same path a notification click takes.
 */
export const pushDeeplink = (host: EventHost, url: string): void => {
    host.pushEvent({
        type: 'OnReceiveNotification',
        success: true,
        data: { notification: { data: { deeplink: url } } },
    });
};

/**
 * Pushes a (re-minted) FCM token unasked, so the renderer re-registers it with the broker. It is the
 * FetchFcmToken reply type; the renderer's listener takes it beyond its own one-shot request.
 */
export const pushFcmToken = (host: EventHost, token: string): void => {
    host.pushEvent({ type: 'OnFetchFcmToken', success: true, data: { token } });
};

/**
 * Forwards a cross-cloud push as is. The renderer owns the whole presentation decision (DND,
 * own-message, focus → toast vs ShowNotification banner), the same way it owns same-cloud live-WS
 * banners; raising a banner here would need the renderer's prefs mirrored into the shell.
 */
export const pushFcmMessage = (host: EventHost, push: ForwardedPush): void => {
    host.pushEvent({
        type: 'OnReceiveNotification',
        success: true,
        data: { notification: { title: push.title, body: push.body, data: push.data } },
    });
};

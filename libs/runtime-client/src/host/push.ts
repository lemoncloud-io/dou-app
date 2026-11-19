import type { OnNotificationPayload, ShowNotificationPayload } from '@chatic/bridge-messages';

import type { ShellOrBrowser } from './ports';

/**
 * Who receives notifications for this device: registering its token, raising a banner, and the taps
 * and deliveries that come back. `shell` — the app does, through its bridge; `browser` — nothing does:
 * a browser tab registers no device and receives no push.
 *
 * Every member is something only an app has, so each is `null` where the host has none, and a feature
 * asks for the member, not for the side. The phone app and the desktop app are both shells and differ
 * in what they do — the phone raises its banners from the push itself, the desktop app raises them when
 * the page asks and announces a renewed token on its own — so each fills the members it has.
 */
export interface PushPort {
    readonly kind: ShellOrBrowser;
    /**
     * What the app hands the page about notifications: a tap on one of its banners and a delivery while
     * the page is open — and, in the desktop app, its menu bar's `chatic-ui:` links, which ride the same
     * message. `null` where nothing arrives: a browser.
     */
    readonly notifications: NotificationFeed | null;
    /** The device's push token. `null` where there is none to register: a browser. */
    readonly deviceToken: DeviceTokenSource | null;
    /**
     * The app's own word that it minted a new token. `null` where it gives none and a renewed token is
     * picked up at the next launch: the phone app, and a browser.
     */
    readonly tokenRenewal: DeviceTokenRenewal | null;
    /**
     * An OS banner the page raises itself. `null` where it cannot: the phone app raises its banners from
     * the push, not on the page's request, and a browser has none to raise.
     */
    readonly localBanner: LocalBanner | null;
}

/** What the app hands the page about notifications. */
export interface NotificationFeed {
    /**
     * Calls `listener` with each notification the app hands over; one that arrives without a payload is
     * not passed on. Returns the unsubscribe.
     */
    onReceive(listener: (payload: OnNotificationPayload) => void): () => void;
}

/** The device's push token, as the app holds it. */
export interface DeviceTokenSource {
    /**
     * The current token, or `null` or an empty string while the app has none — permission refused, not
     * issued yet, or the push service not configured. Rejects when the request fails.
     */
    fetch(): Promise<string | null>;
}

/** The app's announcement of a renewed push token. */
export interface DeviceTokenRenewal {
    /** Calls `listener` each time the app mints a new token. Returns the unsubscribe. */
    onRenew(listener: () => void): () => void;
}

/** An OS banner the page raises. */
export interface LocalBanner {
    /**
     * Shows `banner`; a click on it comes back through `notifications` with its `deeplink`. Fire-and-
     * forget: a banner the app could not show is dropped, never thrown.
     */
    present(banner: ShowNotificationPayload): void;
}

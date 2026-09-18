/**
 * Notification info
 * TODO: needs to be extended to match the notification spec
 * @author dev@example.com
 */
export type NotificationInfo = {
    title?: string;
    body?: string;
    data?: Record<string, any>; // Custom payload
};

/** [Request] Fetch FCM token payload */
export type FetchFcmTokenPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/**
 * [Request] Delete FCM token payload
 *
 * To exercise the re-registration path the token has to be deleted — `FetchFcmToken` is
 * read-only and can't stand in for this (ADR-0080, debug-panel migration step 1).
 */
export type DeleteFcmTokenPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Request] Fetch badge count payload */
export type FetchBadgeCountPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] FCM token result payload */
export type OnFetchFcmTokenPayload = {
    token: string;
};

/** [Response] FCM token deletion result payload */
export type OnDeleteFcmTokenPayload = {
    success: boolean;
};

/** [Response] Notification received/opened event payload */
export type OnNotificationPayload = {
    notification: NotificationInfo;
};

/** [Request] Set badge count payload */
export type SetBadgeCountPayload = {
    count: number;
    /**
     * Optional. Windows only — a PNG data URL to use as the taskbar overlay icon.
     * Windows has no dock badge, so it needs an overlay icon instead, and Electron's
     * nativeImage can't draw SVG, so it's drawn to PNG on the renderer (canvas) and
     * passed in. Ignored on macOS/Linux.
     */
    overlayIconDataUrl?: string;
};

/** [Response] Fetch badge count result payload */
export type OnFetchBadgeCountPayload = {
    count: number;
};

/**
 * [Request] Fetch the badge base (the native shared counter) payload.
 *
 * A separate message from `FetchBadgeCount`. That one is answered by notifee, whose badge
 * API is iOS-only (always 0 elsewhere), so reading the shared store that actually holds
 * the count on Android needs a different channel. It's issued as a new type because web
 * ships ahead of the app — an older shell doesn't know this message, so it answers
 * `NOT_FOUND`, and the web learns "unknown on this shell" from that answer. Changing the
 * meaning of the existing message instead would make that distinction impossible. (ADR-0099)
 */
export type FetchBadgeBasePayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/**
 * [Response] Fetch badge base result payload.
 *
 * `base` being `null` means "unknown on this platform" — not answering with 0 is the
 * whole point of the contract. 0 is a valid count, so answering "unknown" with 0 would
 * let a consumer compare it as though it were a real value.
 */
export type OnFetchBadgeBasePayload = {
    base: number | null;
};

/** [Response] Set badge count result payload */
export type OnSetBadgeCountPayload = {
    success: boolean;
};

/**
 * [Request] Show an OS notification payload (web -> app).
 * Desktop has no FCM, so when a live WS detects a new message it asks the shell to show
 * an OS notification instead.
 */
export type ShowNotificationPayload = {
    title: string;
    body: string;
    channelId?: string;
    deeplink?: string;
};

/** [Response] Show OS notification result payload */
export type OnShowNotificationPayload = {
    success: boolean;
};

/**
 * Raw discriminating hint for a single cross-cloud push that arrived while backgrounded or
 * terminated (ADR-0056). Native does not interpret these fields, it only stores them as-is
 * — the `cid` relay sentinel (`'#'`) and the deployment backend's empty string are also kept
 * raw. Discrimination (resolvePushCloudId) happens only at the single point on the web side.
 */
export type PushCloudMarkRecord = {
    cid?: string;
    uid?: string;
    channelId?: string;
    sid?: string;
    channelName?: string;
};

/** [Request] Fetch cross-cloud push marks payload (ADR-0056). Draining the native store happens at the same time as the response. */
export type FetchPushMarksPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] Cross-cloud push mark drain result payload */
export type OnFetchPushMarksPayload = {
    marks: PushCloudMarkRecord[];
};

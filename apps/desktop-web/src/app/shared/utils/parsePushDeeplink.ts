export interface PushDeeplinkTarget {
    /** Empty when the deeplink names no place (server FCM links carry only a channelId). */
    placeId: string;
    channelId: string;
}

/**
 * Parse a notification deeplink into an open target. Two formats reach the
 * OnReceiveNotification listener:
 *
 * - `chatic-open:<placeId>|<channelId>` — built by useDesktopNotifications for
 *   same-cloud live-WS banners (components URI-encoded).
 * - `channel?channelId=<id>` — the pushes-api `PushData.link` on cross-cloud FCM
 *   pushes; it carries no place, so `placeId` comes back empty and the consumer
 *   opens the channel within the currently loaded places.
 *
 * Anything else (OAuth deeplinks, malformed input) → null.
 */
export const parsePushDeeplink = (deeplink: string | undefined | null): PushDeeplinkTarget | null => {
    if (!deeplink) return null;
    if (deeplink.startsWith('chatic-open:')) {
        const [rawPlace, rawChannel] = deeplink.slice('chatic-open:'.length).split('|');
        const channelId = rawChannel ? decodeURIComponent(rawChannel) : '';
        if (!channelId) return null;
        return { placeId: rawPlace ? decodeURIComponent(rawPlace) : '', channelId };
    }
    const queryStart = deeplink.indexOf('?');
    const query = queryStart >= 0 ? deeplink.slice(queryStart + 1) : deeplink;
    const channelId = new URLSearchParams(query).get('channelId') ?? '';
    return channelId ? { placeId: '', channelId } : null;
};

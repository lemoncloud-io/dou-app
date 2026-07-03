export interface PushDeeplinkTarget {
    /** Source cloud (relay cloudId) when the push is cross-cloud; absent for same-cloud. */
    cloudId?: string;
    /** Empty when the deeplink names no place (a bare server FCM link carries only a channelId). */
    placeId: string;
    channelId: string;
}

/**
 * Parse a notification deeplink into an open target. Three formats reach the
 * OnReceiveNotification listener:
 *
 * - `chatic-open:<placeId>|<channelId>` — same-cloud live-WS banners
 *   (useDesktopNotifications); the target place is in the active cloud.
 * - `chatic-open:<cloudId>|<placeId>|<channelId>` — cross-cloud FCM banners
 *   (useCrossCloudPushNotifications), carrying the source cloud so the consumer
 *   can switch cloud → place → channel. All segments are URI-encoded.
 * - `channel?channelId=<id>` or `/channels/<id>/room` — the raw pushes-api link
 *   fallback when the source cloud couldn't be resolved; no place/cloud,
 *   best-effort open in the currently loaded places.
 *
 * Anything else (OAuth deeplinks, malformed input) → null.
 */
export const parsePushDeeplink = (deeplink: string | undefined | null): PushDeeplinkTarget | null => {
    if (!deeplink) return null;
    const dec = (value: string | undefined): string => (value ? decodeURIComponent(value) : '');
    if (deeplink.startsWith('chatic-open:')) {
        const parts = deeplink.slice('chatic-open:'.length).split('|');
        if (parts.length >= 3) {
            const channelId = dec(parts[2]);
            if (!channelId) return null;
            return { cloudId: dec(parts[0]) || undefined, placeId: dec(parts[1]), channelId };
        }
        const channelId = dec(parts[1]);
        if (!channelId) return null;
        return { placeId: dec(parts[0]), channelId };
    }
    // Server path form `/channels/<channelId>/room`.
    const pathMatch = /\/channels\/([^/?#]+)/.exec(deeplink);
    if (pathMatch) {
        const channelId = dec(pathMatch[1]);
        return channelId ? { placeId: '', channelId } : null;
    }
    const queryStart = deeplink.indexOf('?');
    const query = queryStart >= 0 ? deeplink.slice(queryStart + 1) : deeplink;
    const channelId = new URLSearchParams(query).get('channelId') ?? '';
    return channelId ? { placeId: '', channelId } : null;
};

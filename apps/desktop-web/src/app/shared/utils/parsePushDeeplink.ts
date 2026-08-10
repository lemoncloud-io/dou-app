export interface PushDeeplinkTarget {
    /** Source cloud (relay cloudId) when the push is cross-cloud; absent for same-cloud. */
    cloudId?: string;
    /** Empty when the deeplink names no place (a bare server FCM link carries only a channelId). */
    placeId: string;
    channelId: string;
    /**
     * Thread root (`chat.parentId`, the root's chatNo string — see `threadRootId`) when the
     * pushed message is a reply; absent for a top-level message. Without it the click can only
     * select the channel, and a reply is hidden from the main feed (`isFeedVisible`), so the
     * pushed message would be on no visible surface.
     */
    rootId?: string;
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
 * - `chatic-open:<cloudId>|<placeId>|<channelId>|<rootId>` — a push for a thread
 *   reply. The same-cloud producer leaves the cloud segment empty; the count is
 *   what discriminates, because a 3-segment `place|channel|root` would be read as
 *   the cross-cloud form above.
 * - `channel?channelId=<id>` or `/channels/<id>/room` — the raw pushes-api link
 *   fallback when the source cloud couldn't be resolved; no place/cloud,
 *   best-effort open in the currently loaded places.
 *
 * Anything else (OAuth deeplinks, malformed input) → null.
 */
/**
 * The same-cloud producer of the format above (useDesktopNotifications' OS banner). Kept
 * beside the parser so the two sides of the encoding can't drift apart.
 *
 * A reply must carry its thread root, or the click can only select the channel — where the
 * pushed message is not rendered at all, since the main feed hides replies (`isFeedVisible`).
 * Carrying it needs the 4-segment form with an empty cloud segment: a 3-segment same-cloud
 * `place|channel|root` would be read as the cross-cloud `cloud|place|channel`. A top-level
 * message keeps the 2-segment form it has always used.
 *
 * `parentId` on a persisted record is already the root's chatNo string — the same key the
 * open-thread store and `ThreadPanel` take (see `threadRootId`), so it needs no conversion.
 */
export const buildOpenDeeplink = (placeId: string, channelId: string, parentId?: string): string => {
    const enc = encodeURIComponent;
    if (!parentId) return `chatic-open:${enc(placeId)}|${enc(channelId)}`;
    return `chatic-open:|${enc(placeId)}|${enc(channelId)}|${enc(parentId)}`;
};

export const parsePushDeeplink = (deeplink: string | undefined | null): PushDeeplinkTarget | null => {
    if (!deeplink) return null;
    const dec = (value: string | undefined): string => (value ? decodeURIComponent(value) : '');
    if (deeplink.startsWith('chatic-open:')) {
        const parts = deeplink.slice('chatic-open:'.length).split('|');
        if (parts.length >= 4) {
            const channelId = dec(parts[2]);
            if (!channelId) return null;
            return {
                cloudId: dec(parts[0]) || undefined,
                placeId: dec(parts[1]),
                channelId,
                rootId: dec(parts[3]) || undefined,
            };
        }
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

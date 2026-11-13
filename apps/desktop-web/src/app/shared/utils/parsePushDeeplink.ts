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
    /**
     * The message itself, from a copied message link: the feed lands on it instead of the bottom. A
     * notification has none — it opens the conversation at its latest.
     */
    chatNo?: number;
}

/**
 * A copied message link: `chatic://message/<cloud>/<place>/<channel>/<chatNo>[?root=<rootId>]`, or
 * `chatic-dev:` from the dev channel. Each segment is URI-encoded; the cloud is empty when it was not
 * known. Both schemes are read — receiving one is harmless, only the shell decides which it is sent.
 */
const MESSAGE_LINK = /^chatic(?:-dev)?:\/\/message\/([^/?#]*)\/([^/?#]*)\/([^/?#]+)\/(\d+)\/?(?:\?root=([^&#]+))?$/;

/**
 * Parse a notification deeplink into an open target. Five formats reach the
 * OnReceiveNotification listener:
 *
 * - `chatic://message/…` — a copied message link (`MESSAGE_LINK`), opened from outside the app.
 * - `chatic-open:<placeId>|<channelId>` — same-cloud banners; the target place is
 *   in the active cloud.
 * - `chatic-open:<cloudId>|<placeId>|<channelId>` — cross-cloud banners, carrying
 *   the source cloud so the consumer can switch cloud → place → channel. All
 *   segments are URI-encoded.
 * - `chatic-open:<cloudId>|<placeId>|<channelId>|<rootId>` — a push for a thread
 *   reply. The cloud segment is empty when the push is same-cloud: the segment
 *   count is what discriminates, because a 3-segment `place|channel|root` would be
 *   read as the cross-cloud form above.
 * - `channel?channelId=<id>` or `/channels/<id>/room` — the raw pushes-api link
 *   fallback when the source cloud couldn't be resolved; no place/cloud,
 *   best-effort open in the currently loaded places.
 *
 * Anything else (OAuth deeplinks, malformed input) → null.
 */
export const parsePushDeeplink = (deeplink: string | undefined | null): PushDeeplinkTarget | null => {
    if (!deeplink) return null;
    const dec = (value: string | undefined): string => (value ? decodeURIComponent(value) : '');
    const link = MESSAGE_LINK.exec(deeplink);
    if (link) {
        // Anything on the machine can open the scheme: a malformed escape is refused, not thrown into
        // the listeners that share this event.
        try {
            const [cloudId, placeId, channelId, chatNo, rootId] = link.slice(1).map(dec);
            if (!Number.isSafeInteger(Number(chatNo))) return null;
            return {
                ...(cloudId ? { cloudId } : {}),
                placeId,
                channelId,
                chatNo: Number(chatNo),
                ...(rootId ? { rootId } : {}),
            };
        } catch {
            return null;
        }
    }
    // Any other `chatic:` link (sign-in) is not an open target, whatever its query says.
    if (/^chatic(?:-dev)?:\/\//.test(deeplink)) return null;
    if (deeplink.startsWith('chatic-open:')) {
        const parts = deeplink.slice('chatic-open:'.length).split('|');
        if (parts.length >= 3) {
            const channelId = dec(parts[2]);
            if (!channelId) return null;
            return {
                cloudId: dec(parts[0]) || undefined,
                placeId: dec(parts[1]),
                channelId,
                // Absent in the 3-segment form — `parts[3]` is undefined there, which decodes
                // to '' and so reads the same as an empty root segment.
                rootId: dec(parts[3]) || undefined,
            };
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

/**
 * Encode an open target as a deeplink, in the grammar `parsePushDeeplink` reads above. Both
 * banner producers go through here so the two sides of the encoding can't drift apart, and it
 * takes the parser's own target type so the round trip is checkable.
 *
 * The shortest form that carries every present field wins: a root needs 4 segments (a
 * 3-segment `place|channel|root` would be read as cross-cloud), a source cloud needs 3, and a
 * plain same-cloud message stays on the 2-segment form it has always used.
 */
export const buildOpenDeeplink = ({ cloudId, placeId, channelId, rootId }: PushDeeplinkTarget): string => {
    const enc = encodeURIComponent;
    if (rootId) return `chatic-open:${enc(cloudId ?? '')}|${enc(placeId)}|${enc(channelId)}|${enc(rootId)}`;
    if (cloudId) return `chatic-open:${enc(cloudId)}|${enc(placeId)}|${enc(channelId)}`;
    return `chatic-open:${enc(placeId)}|${enc(channelId)}`;
};

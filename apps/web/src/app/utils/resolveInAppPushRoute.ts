import { ROUTES } from '../routes/paths';

/**
 * Push payload `data` as forwarded by the native shell in `OnReceiveNotification`.
 * Field types are unknown because the payload crosses FCM + the bridge as loosely
 * typed JSON (Android fills `link`/`clickAction`, some senders flatten cid/sid,
 * others nest them in a `payload` JSON string).
 */
export type InAppPushData = Record<string, unknown>;

// A dummy base so `URL` can parse both absolute-relative ("/a/b") and bare ("a/b?x=1") inputs.
const PARSE_BASE = 'http://chatic.local';

const asString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

/**
 * Merges a push's `payload` (JSON string or object, per sender) over its top-level fields. Some
 * senders flatten cid/sid/etc. onto `data` directly; others nest them in `payload`. Shared by every
 * field-extractor below so the merge rule lives in exactly one place.
 */
const mergePushPayload = (data: InAppPushData): Record<string, unknown> => {
    const { payload } = data;
    if (typeof payload === 'string') {
        try {
            return { ...data, ...(JSON.parse(payload) as Record<string, unknown>) };
        } catch {
            return data; // Malformed payload JSON: keep the top-level data as the source.
        }
    }
    if (payload && typeof payload === 'object') {
        return { ...data, ...(payload as Record<string, unknown>) };
    }
    return data;
};

/**
 * Resolves cloud/site context from the push data. cid/sid live inside `payload` per spec, but we
 * also honor top-level `cid`/`sid` as a fallback for senders that flatten them onto `data`.
 * (Web port of the mobile `extractPushContext` in `deeplinkUtils.ts` — keep the two in sync.)
 *
 * `chatId` rides along from the same merged source. It is the notified message's full id, which
 * downstream turns into a thread hop when that message is a reply (see `resolveThreadTarget`);
 * the mobile port has no use for it because the tap path resolves its own link natively.
 */
export const extractPushContext = (data: InAppPushData): { cid?: string; sid?: string; chatId?: string } => {
    const source = mergePushPayload(data);
    return { cid: asString(source.cid), sid: asString(source.sid), chatId: asString(source.chatId) };
};

/** Cross-cloud push mark hint (ADR-0056) — every field `resolvePushCloudId` can use to disambiguate. */
export interface PushCloudHint {
    cid?: string;
    uid?: string;
    channelId?: string;
    sid?: string;
    channelName?: string;
}

/**
 * The fuller field set `resolvePushCloudId` needs — same merge rule as {@link extractPushContext},
 * plus the fields that only matter for cross-cloud dot marking (`uid`, `channelId`, `channelName`).
 */
export const extractPushCloudHint = (data: InAppPushData): PushCloudHint => {
    const source = mergePushPayload(data);
    return {
        cid: asString(source.cid),
        uid: asString(source.uid),
        channelId: asString(source.channelId),
        sid: asString(source.sid),
        channelName: asString(source.channelName),
    };
};

/** Drop a leading custom scheme (chatic://, chatic-dev://) so only path/query is parsed. */
const stripPushScheme = (link: string): string => {
    const match = link.match(/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\/(.*)$/);
    return match ? match[1] : link;
};

/**
 * Maps a foreground push's `notification.data` to the raw navigation path an in-app
 * notification click should open, with cid/sid merged into the query. Mirrors the mobile
 * `resolvePushTapPath` (which feeds `OnNavigate` on a push *tap*) so the in-app banner
 * click and the OS notification tap land on the same screen. The returned path is raw on
 * purpose — `resolvePushNavigation` (via `usePushNavigate`) owns canonicalization and
 * cid/sid extraction downstream.
 *
 * Returns `null` when the payload carries nothing routable; the banner then renders
 * as display-only.
 */
export const resolveInAppPushRoute = (data: InAppPushData | undefined | null): string | null => {
    if (!data) {
        return null;
    }

    const { cid, sid, chatId } = extractPushContext(data);
    const link = asString(data.link) ?? asString(data.clickAction);

    if (!link) {
        // No link at all — fall back to the channel id so a partially filled payload
        // (seen on some sender paths) still opens the room.
        const channelId = asString(data.channelId);
        if (!channelId) {
            return null;
        }
        const query = [
            cid ? `cid=${encodeURIComponent(cid)}` : null,
            sid ? `sid=${encodeURIComponent(sid)}` : null,
            chatId ? `chatId=${encodeURIComponent(chatId)}` : null,
        ]
            .filter(Boolean)
            .join('&');
        return `${ROUTES.channels.room(channelId)}${query ? `?${query}` : ''}`;
    }

    let url: URL;
    try {
        url = new URL(stripPushScheme(link), PARSE_BASE);
    } catch {
        return null;
    }

    // Merge context without overriding values the link already carries explicitly.
    if (cid && !url.searchParams.has('cid')) {
        url.searchParams.set('cid', cid);
    }
    if (sid && !url.searchParams.has('sid')) {
        url.searchParams.set('sid', sid);
    }
    if (chatId && !url.searchParams.has('chatId')) {
        url.searchParams.set('chatId', chatId);
    }

    return `${url.pathname}${url.search}${url.hash}`;
};

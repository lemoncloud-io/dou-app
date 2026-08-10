import { ROUTES } from '../../routes/paths';

/**
 * Result of normalizing a native `OnNavigate` path into a router-ready target
 * plus the cloud/site context required to render it.
 */
export interface ResolvedPushNavigation {
    /** Canonical, router-ready path with `cid`/`sid`/`chatId` stripped. */
    target: string;
    /** Target cloud id when the push points at another cloud; `null` otherwise. */
    cid: string | null;
    /** Target site id when the push points at another site; `null` otherwise. */
    sid: string | null;
    /**
     * The notified chat's full id (`<channelId>:<chatNo>`) when the link carries one.
     *
     * A routing hint rather than a route param — the caller lands on the channel room first
     * and then asks whether this chat is a thread reply, hopping to the thread only if it is
     * (see `usePushNavigate`). So it is stripped from `target` the same way cid/sid are: the
     * room URL must stay canonical, or `navigateNormalized`'s "already there" check would
     * treat two taps on the same room as different destinations.
     */
    chatId: string | null;
}

// A dummy base so `URL` can parse both absolute-relative ("/a/b") and bare ("a/b?x=1") inputs.
const PARSE_BASE = 'http://chatic.local';

/**
 * Resolves a raw navigation path coming from a native `OnNavigate` bridge event
 * (originating from a push notification's `link`) into a canonical web route plus
 * the cloud/site context needed to render it.
 *
 * The link server sends web-aligned paths such as `/channels/{id}/room`, optionally
 * carrying the target cloud/site as `cid`/`sid` query params. Those params are session
 * concerns rather than route params, so they are stripped from the returned `target`.
 * `chatId` gets the same treatment for a different reason — it is a thread-routing hint
 * the caller consumes after landing on the room (see `ResolvedPushNavigation.chatId`).
 *
 * A spec-style fallback (`channel?channelId={id}`) is normalized to the canonical
 * `/channels/{id}/room` route so both formats route correctly. The context params are
 * read BEFORE that branch, since it rebuilds the target from `channelId` alone and would
 * otherwise drop them.
 */
export const resolvePushNavigation = (rawPath: string): ResolvedPushNavigation => {
    if (!rawPath || !rawPath.trim()) {
        return { target: ROUTES.root, cid: null, sid: null, chatId: null };
    }

    let url: URL;
    try {
        url = new URL(rawPath.trim(), PARSE_BASE);
    } catch {
        // Unparseable input: pass it through untouched rather than dropping the navigation.
        return { target: rawPath, cid: null, sid: null, chatId: null };
    }

    const params = url.searchParams;
    const cid = params.get('cid');
    const sid = params.get('sid');
    const chatId = params.get('chatId');
    params.delete('cid');
    params.delete('sid');
    params.delete('chatId');

    // Fallback: spec-style `channel?channelId={id}` → canonical `/channels/{id}/room`.
    const normalizedPathname = url.pathname.replace(/\/+$/, '') || '/';
    if (normalizedPathname === '/channel') {
        const channelId = params.get('channelId');
        if (channelId) {
            return { target: ROUTES.channels.room(channelId), cid, sid, chatId };
        }
    }

    const query = params.toString();
    const target = `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
    return { target, cid, sid, chatId };
};

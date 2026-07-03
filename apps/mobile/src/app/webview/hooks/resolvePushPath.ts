/**
 * Builds the WebView-relative navigation path from a push notification payload.
 *
 * The push spec keeps `link` (a web-aligned path such as `channel?channelId=X` or
 * `/channels/{id}/room`) separate from the `payload` object that carries cloud/site context
 * (`cid`/`sid`). The web only reads cid/sid from the navigation query (see the web-side
 * `resolvePushNavigation`), so this helper merges them into the query before we emit `OnNavigate`.
 *
 * The frontend host is intentionally omitted: the WebView always lives at WEBVIEW_URL, so a
 * relative path (pathname+search+hash) is all the bridge needs.
 */

// Dummy base so `URL` parses both absolute-relative ("/a/b") and bare ("a/b?x=1") link forms.
const PARSE_BASE = 'http://chatic.local';

export interface PushNavigationData {
    link?: unknown;
    clickAction?: unknown;
    /** Metadata object (or its JSON string) holding cid/sid per the push payload spec. */
    payload?: unknown;
    cid?: unknown;
    sid?: unknown;
    [key: string]: unknown;
}

const asString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

/**
 * Resolves cloud/site context from the push data. cid/sid live inside `payload` per spec, but we
 * also honor top-level `cid`/`sid` as a fallback for senders that flatten them onto `data`.
 */
const extractContext = (data: PushNavigationData): { cid?: string; sid?: string } => {
    let source: Record<string, unknown> = data;

    const { payload } = data;
    if (typeof payload === 'string') {
        try {
            source = { ...data, ...(JSON.parse(payload) as Record<string, unknown>) };
        } catch {
            // Malformed payload JSON: keep the top-level data as the context source.
        }
    } else if (payload && typeof payload === 'object') {
        source = { ...data, ...(payload as Record<string, unknown>) };
    }

    return { cid: asString(source.cid), sid: asString(source.sid) };
};

/** Drop a leading custom scheme (chatic://, chatic-dev://) so only path/query is parsed. */
const stripScheme = (link: string): string => {
    const match = link.match(/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\/(.*)$/);
    return match ? match[1] : link;
};

/**
 * Returns the relative path (pathname+search+hash) to hand the web via an `OnNavigate` event,
 * with cid/sid merged into the query. Returns null when there is no link — a tap then simply
 * foregrounds the app without forcing navigation.
 */
export const resolvePushPath = (data: PushNavigationData | undefined | null): string | null => {
    if (!data) {
        return null;
    }

    const link = asString(data.link) ?? asString(data.clickAction);
    if (!link) {
        return null;
    }

    const { cid, sid } = extractContext(data);

    let url: URL;
    try {
        url = new URL(stripScheme(link), PARSE_BASE);
    } catch {
        return null;
    }

    // Reading pathname/search/hash is safe, but cid/sid must be merged by string-building rather than
    // `searchParams.set()`. React Native's URL derives `.search` from the raw string and ignores
    // URLSearchParams mutations, so a set-then-read would silently drop cid/sid on device (Node/Jest
    // hides this because it reflects the mutation). `searchParams.has()` is still fine — it only reads.
    const existingQuery = url.search.startsWith('?') ? url.search.slice(1) : url.search;
    const query = existingQuery ? [existingQuery] : [];

    // Merge context without overriding values the link already carries explicitly.
    if (cid && !url.searchParams.has('cid')) {
        query.push(`cid=${encodeURIComponent(cid)}`);
    }
    if (sid && !url.searchParams.has('sid')) {
        query.push(`sid=${encodeURIComponent(sid)}`);
    }

    const search = query.length ? `?${query.join('&')}` : '';
    return `${url.pathname}${search}${url.hash}`;
};

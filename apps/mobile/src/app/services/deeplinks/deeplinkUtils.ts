import Config from 'react-native-config';

import type { ILogService } from '../log';

/**
 * Deep Link Utilities (Local to Mobile App)
 *
 * Handles deep link validation, parsing, campaign parameter extraction,
 * and conversion to frontend WebView URLs.
 */

/** Valid domains that can be used as deep link sources */
export const VALID_DOMAINS = [
    'app.chatic.io',
    'app-dev.chatic.io',
    'dou.chatic.io',
    'dou-dev.chatic.io',
    'chatic.io',
] as const;

/** Valid URL schemes */
export const VALID_SCHEMES = ['chatic', 'chatic-dev', 'https', 'http'] as const;

/** Custom URL schemes (non-http) */
export const CUSTOM_SCHEMES = ['chatic', 'chatic-dev'] as const;

/** Deep link domains that need conversion to frontend domain */
export const DEEP_LINK_DOMAINS = ['app.chatic.io', 'app-dev.chatic.io'] as const;

export const DEEPLINK_DOMAIN_PROD = 'app.chatic.io';
export const DEEPLINK_DOMAIN_DEV = 'app-dev.chatic.io';

// AWS region hosting the invite backend API Gateway; used to expand `api`+`stage` into `_backend`.
const INVITE_BACKEND_REGION = 'ap-northeast-2';

export interface ConvertedUrlResult {
    url: string;
}

/** Type guards */
export const isValidScheme = (scheme: string): scheme is (typeof VALID_SCHEMES)[number] =>
    (VALID_SCHEMES as readonly string[]).includes(scheme);

export const isCustomScheme = (scheme: string): scheme is (typeof CUSTOM_SCHEMES)[number] =>
    (CUSTOM_SCHEMES as readonly string[]).includes(scheme);

export const isValidDomain = (domain: string): domain is (typeof VALID_DOMAINS)[number] =>
    (VALID_DOMAINS as readonly string[]).includes(domain);

export const isDeepLinkDomain = (domain: string): domain is (typeof DEEP_LINK_DOMAINS)[number] =>
    (DEEP_LINK_DOMAINS as readonly string[]).includes(domain);

/**
 * Safely parses any URL, including custom schemes, by normalizing them to standard HTTPS URLs first.
 * This ensures the pathname and query parameters are parsed correctly regardless of the scheme.
 */
export const parseUrlSafe = (url: string): URL => {
    let normalized = url;
    if (url.startsWith('chatic://')) {
        normalized = url.replace('chatic://', 'https://app.chatic.io/');
    } else if (url.startsWith('chatic-dev://')) {
        normalized = url.replace('chatic-dev://', 'https://app-dev.chatic.io/');
    }
    return new URL(normalized);
};

/**
 * Validates if a URL is a valid deep link
 */
export const isValidDeepLink = (url: string): boolean => {
    try {
        const scheme = url.split('://')[0];
        if (!isValidScheme(scheme)) {
            return false;
        }

        const parsed = parseUrlSafe(url);
        if (isCustomScheme(scheme)) {
            return true;
        }

        if (!isValidDomain(parsed.hostname)) {
            console.warn(`[DeepLink] Invalid domain: ${parsed.hostname}`);
            return false;
        }

        return true;
    } catch (error) {
        console.error('[DeepLink] Invalid URL format:', error);
        return false;
    }
};

/**
 * Extracts campaign parameters from URL (UTM, referrer, etc.)
 */
export const extractCampaignParams = (url: string): Record<string, string> => {
    try {
        const parsed = parseUrlSafe(url);
        const params: Record<string, string> = {};
        const utmParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

        utmParams.forEach(param => {
            const value = parsed.searchParams.get(param);
            if (value) {
                params[param] = value;
            }
        });

        const ref = parsed.searchParams.get('ref') || parsed.searchParams.get('referrer');
        if (ref) {
            params.referrer = ref;
        }

        return params;
    } catch {
        return {};
    }
};

/**
 * Check if URL matches the new dynamic invite URL pattern
 */
export const isNewPatternInviteUrl = (url: string): boolean => {
    try {
        const parsed = parseUrlSafe(url);
        const isSPath = parsed.pathname === '/s' || parsed.pathname === '/s/';

        if (!isSPath) {
            return false;
        }

        const hasCode = parsed.searchParams.has('code');
        const hasApi = parsed.searchParams.has('api') || parsed.searchParams.has('backend');

        return !!(hasCode && hasApi);
    } catch {
        return false;
    }
};

/**
 * Check if URL is a short URL (/s/{code} pattern)
 */
export const isShortUrl = (url: string): boolean => {
    try {
        if (isNewPatternInviteUrl(url)) {
            return false;
        }
        const parsed = parseUrlSafe(url);
        return parsed.pathname.startsWith('/s/');
    } catch {
        return false;
    }
};

/**
 * Extract short code from URL
 */
export const extractShortCode = (url: string): string | null => {
    try {
        if (isNewPatternInviteUrl(url)) {
            return null;
        }
        const parsed = parseUrlSafe(url);
        const match = parsed.pathname.match(/^\/s\/([^/]+)/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
};

/**
 * Expands an invite deep link into the WEBVIEW_URL-relative URL the web consumes.
 *
 * The frontend host is intentionally omitted: the WebView always loads from WEBVIEW_URL
 * (`VITE_WEBVIEW_BASE_URL`), and the OnNavigate contract carries only the relative path.
 *
 * - New-pattern invite links (`/s?code=…&api=…&stage=…`) are expanded to the home route with the
 *   invite markers (`provider=invite&version=2`) and a resolved `_backend`, returned as a relative URL.
 * - Everything else passes through unchanged; resolveWebPath reduces it to pathname+search+hash.
 */
export const convertShortUrlWithEnvsSync = (url: string): ConvertedUrlResult => {
    if (isNewPatternInviteUrl(url)) {
        try {
            const parsed = parseUrlSafe(url);
            const code = parsed.searchParams.get('code');
            const api = parsed.searchParams.get('api');
            const stage = parsed.searchParams.get('stage');
            const backendParam = parsed.searchParams.get('backend');

            if (!code) {
                throw new Error('Missing code parameter in deep link');
            }

            let backend = backendParam || undefined;

            if (!backend && api && stage) {
                backend = `https://${api}.execute-api.${INVITE_BACKEND_REGION}.amazonaws.com/${stage}`;
            }

            // Assemble the query as a string rather than via `new URL().searchParams.set()`.
            // React Native's built-in URL derives `.search` from the raw URL string and ignores
            // URLSearchParams mutations, so `${url.pathname}${url.search}` drops everything we set and
            // collapses the invite link to a bare "/". (Node/Jest reflects the mutation, which is why
            // the unit tests stayed green while the device silently lost the invite params.)
            const query = [`code=${encodeURIComponent(code)}`, 'provider=invite', 'version=2'];
            if (backend) {
                query.push(`_backend=${encodeURIComponent(backend)}`);
            }
            // Forward any other query parameters (e.g. utm_*) except the ones we consumed above.
            parsed.searchParams.forEach((value, key) => {
                if (key !== 'code' && key !== 'api' && key !== 'stage' && key !== 'backend') {
                    query.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
                }
            });

            const relativeUrl = `/?${query.join('&')}`;
            console.log('[UrlConverter] New pattern dynamic link parsed:', url, '→', relativeUrl);

            return { url: relativeUrl };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[UrlConverter] Error parsing new pattern dynamic link:', message);
            throw error;
        }
    }

    if (isShortUrl(url)) {
        console.warn('[UrlConverter] Old Firestore short URLs are no longer supported:', url);
        throw new Error('Old style shortcode invite links are no longer supported');
    }

    return { url };
};

// ============================================================================
// Push notification tap → WebView path
// ============================================================================

// Dummy base so `URL` parses both absolute-relative ("/a/b") and bare ("a/b?x=1") link forms.
const PUSH_PARSE_BASE = 'http://chatic.local';

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
const extractPushContext = (data: PushNavigationData): { cid?: string; sid?: string } => {
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
const stripPushScheme = (link: string): string => {
    const match = link.match(/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\/(.*)$/);
    return match ? match[1] : link;
};

/**
 * Returns the WEBVIEW_URL-relative path (pathname+search+hash) for a push notification tap, with
 * cid/sid merged into the query. Returns null when there is no link — the tap then simply
 * foregrounds the app without forcing navigation. Shared with the deep link path so push taps and
 * deep links converge on one OnNavigate contract.
 */
export const resolvePushTapPath = (data: PushNavigationData | undefined | null): string | null => {
    if (!data) {
        return null;
    }

    const link = asString(data.link) ?? asString(data.clickAction);
    if (!link) {
        return null;
    }

    const { cid, sid } = extractPushContext(data);

    let url: URL;
    try {
        url = new URL(stripPushScheme(link), PUSH_PARSE_BASE);
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

// ============================================================================
// Deep link resolution (OS universal links / custom schemes / invite links)
// ============================================================================

/** Native debug screens reachable via `chatic://debug/<Screen>?target=native`. */
const DEBUG_SCREENS = [
    'Home',
    'SocketTest',
    'InAppPurchaseTest',
    'NotificationTest',
    'DeeplinkTest',
    'DeviceTest',
    'AppIconTest',
    'BridgeTest',
    'OAuthTest',
    'StorageTest',
    'SmsTest',
    'UploadTest',
] as const;

/** Partial navigation state accepted by navigationRef.reset() for native (Debug/Modal) routes. */
export type NativeRouteState = {
    routes: Array<{ name: string; state?: unknown; params?: Record<string, string> }>;
};

/**
 * Discriminated result of resolving an inbound deep link:
 * - `web`: a WEBVIEW_URL-relative path to hand the web via OnNavigate.
 * - `native`: a navigation state to apply imperatively (target=native Debug/Modal).
 * - `invalid`: validation/parse failure; the caller surfaces an error screen.
 */
export type DeepLinkResolution =
    | { kind: 'web'; path: string }
    | { kind: 'native'; state: NativeRouteState }
    | { kind: 'invalid'; error: string };

/**
 * Reconstructs a full scheme URL from a raw path. React Navigation hands warm-start links as
 * leading-slash paths ("/s?code=..."), so we re-apply the env custom scheme before parsing.
 */
const reconstructDeepLinkUrl = (path: string): string => {
    if (path.startsWith('http://') || path.startsWith('https://') || path.includes('://')) {
        return path;
    }
    const scheme = Config.VITE_ENV === 'DEV' ? 'chatic-dev' : 'chatic';
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${scheme}://${cleanPath}`;
};

/**
 * Builds the native navigation state for `target=native` links (Debug screens, Main modal).
 * Unknown native routes fall back to the Main screen.
 */
const buildNativeRouteState = (urlObj: URL, logger?: ILogService): NativeRouteState => {
    const segments = urlObj.pathname.split('/').filter(Boolean);
    const root = segments[0]?.toLowerCase();

    // Forward every param except the routing marker `target` to the native screen.
    const routeParams: Record<string, string> = {};
    urlObj.searchParams.forEach((value, key) => {
        if (key !== 'target') {
            routeParams[key] = value;
        }
    });
    const params = Object.keys(routeParams).length > 0 ? routeParams : undefined;

    if (root === 'debug') {
        const screenSegment = segments[1]?.toLowerCase();
        const matchedScreen = DEBUG_SCREENS.find(s => s.toLowerCase() === screenSegment) || 'Home';
        logger?.info('DEEPLINK', '[deeplinkUtils] Native route → Debug', { screen: matchedScreen, params });
        return { routes: [{ name: 'Debug', state: { routes: [{ name: matchedScreen, params }] } }] };
    }

    if (root === 'main' && segments[1]?.toLowerCase() === 'modal') {
        logger?.info('DEEPLINK', '[deeplinkUtils] Native route → Modal', { params });
        return { routes: [{ name: 'Main', state: { routes: [{ name: 'Modal', params }] } }] };
    }

    logger?.info('DEEPLINK', '[deeplinkUtils] Unknown native route, falling back to Main', {
        pathname: urlObj.pathname,
    });
    return { routes: [{ name: 'Main', state: { routes: [{ name: 'Main' }] } }] };
};

/**
 * Reduces a web deep link to a WEBVIEW_URL-relative path. Invite links expand via
 * convertShortUrlWithEnvsSync (already host-less); other links are reduced to pathname+search+hash.
 * Parsing stays read-only per the RN URL footgun documented on convertShortUrlWithEnvsSync.
 * Throws for retired /s/{code} shortcodes (surfaced by resolveDeepLink as `invalid`).
 */
const resolveWebPath = (fullUrl: string): string => {
    const converted = convertShortUrlWithEnvsSync(fullUrl).url;
    // Invite conversion already yields a host-less relative path (/?code=...); a passthrough is
    // still a full scheme URL that we reduce to pathname+search+hash without mutating searchParams.
    if (converted.startsWith('/')) {
        return converted;
    }
    const parsed = parseUrlSafe(converted);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
};

/**
 * Resolves an inbound deep link into a routing decision. This is the single entry the deep link
 * coordinator uses; push taps share resolvePushTapPath so both converge on the OnNavigate contract.
 */
export const resolveDeepLink = (rawUrl: string, logger?: ILogService): DeepLinkResolution => {
    const fullUrl = reconstructDeepLinkUrl(rawUrl);
    logger?.info('DEEPLINK', '[deeplinkUtils] resolveDeepLink', { rawUrl, fullUrl });

    if (!isValidDeepLink(fullUrl)) {
        // Surface why validation failed (scheme/domain) so an unroutable link stays traceable.
        let hostname: string | undefined;
        try {
            hostname = parseUrlSafe(fullUrl).hostname;
        } catch {
            hostname = undefined;
        }
        const error = `Invalid deep link (scheme=${fullUrl.split('://')[0]}, host=${hostname ?? 'n/a'})`;
        logger?.warn('DEEPLINK', '[deeplinkUtils] resolveDeepLink invalid, dropping', { fullUrl, error });
        return { kind: 'invalid', error };
    }

    try {
        const urlObj = parseUrlSafe(fullUrl);
        const target = urlObj.searchParams.get('target');
        if (target === 'native') {
            return { kind: 'native', state: buildNativeRouteState(urlObj, logger) };
        }
        return { kind: 'web', path: resolveWebPath(fullUrl) };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger?.error('DEEPLINK', '[deeplinkUtils] resolveDeepLink conversion failed', error);
        return { kind: 'invalid', error: message };
    }
};

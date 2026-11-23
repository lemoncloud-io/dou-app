import Config from 'react-native-config';

import {
    decodeInviteLink,
    isEncodedInviteUrl,
    isSubWebViewAppLinkAttempt,
    readInviteLink,
    readSubWebViewAppLink,
    subWebViewLinkPath,
} from '@chatic/shared';

import type { ILogService } from '../log';

export const VALID_DOMAINS = [
    'app.chatic.io',
    'app-dev.chatic.io',
    'dou.chatic.io',
    'dou-dev.chatic.io',
    'chatic.io',
] as const;

export const VALID_SCHEMES = ['chatic', 'chatic-dev', 'https', 'http'] as const;

export const CUSTOM_SCHEMES = ['chatic', 'chatic-dev'] as const;

export const DEEP_LINK_DOMAINS = ['app.chatic.io', 'app-dev.chatic.io'] as const;

export const getAppScheme = (): (typeof CUSTOM_SCHEMES)[number] =>
    Config.VITE_ENV === 'PROD' ? 'chatic' : 'chatic-dev';

const INVITE_BACKEND_REGION = 'ap-northeast-2';

export interface ConvertedUrlResult {
    url: string;
}

export const isValidScheme = (scheme: string): scheme is (typeof VALID_SCHEMES)[number] =>
    (VALID_SCHEMES as readonly string[]).includes(scheme);

export const isCustomScheme = (scheme: string): scheme is (typeof CUSTOM_SCHEMES)[number] =>
    (CUSTOM_SCHEMES as readonly string[]).includes(scheme);

export const isValidDomain = (domain: string): domain is (typeof VALID_DOMAINS)[number] =>
    (VALID_DOMAINS as readonly string[]).includes(domain);

const normalizeSchemeForParsing = (url: string): string => {
    if (url.startsWith('chatic://')) {
        return url.replace('chatic://', 'https://app.chatic.io/');
    }
    if (url.startsWith('chatic-dev://')) {
        return url.replace('chatic-dev://', 'https://app-dev.chatic.io/');
    }
    return url;
};

export const parseUrlSafe = (url: string): URL => new URL(normalizeSchemeForParsing(url));

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

export const isNewPatternInviteUrl = (url: string): boolean => {
    try {
        const parsed = parseUrlSafe(url);
        const isSPath = parsed.pathname === '/s' || parsed.pathname === '/s/';

        if (!isSPath) {
            return false;
        }

        const hasCode = parsed.searchParams.has('code');
        const hasApi = parsed.searchParams.has('api') || parsed.searchParams.has('backend');
        const hasRelay = parsed.searchParams.has('relay');

        return !!(hasCode && (hasApi || hasRelay));
    } catch {
        return false;
    }
};

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

export const convertShortUrlWithEnvsSync = (url: string): ConvertedUrlResult => {
    const normalized = normalizeSchemeForParsing(url);
    if (isEncodedInviteUrl(normalized)) {
        try {
            const target = decodeInviteLink(normalized);
            if (!target) {
                throw new Error('Unreadable encoded invite link');
            }

            const query = [`code=${encodeURIComponent(target.code)}`, 'provider=invite', 'version=2'];
            if (target.relay) {
                query.push('relay=1');
            } else if (target.backend) {
                query.push(`_backend=${encodeURIComponent(target.backend)}`);
            }

            try {
                parseUrlSafe(url).searchParams.forEach((value, key) => {
                    if (key !== 't') {
                        query.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
                    }
                });
            } catch {
                // Nothing forwarded; the invite params above are complete without it.
            }

            const relativeUrl = `/?${query.join('&')}`;
            console.log('[UrlConverter] Encoded invite link parsed:', url, '→', relativeUrl);

            return { url: relativeUrl };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[UrlConverter] Error parsing encoded invite link:', message);
            throw error;
        }
    }

    if (isNewPatternInviteUrl(url)) {
        try {
            const parsed = parseUrlSafe(url);
            const code = parsed.searchParams.get('code');
            const api = parsed.searchParams.get('api');
            const stage = parsed.searchParams.get('stage');
            const backendParam = parsed.searchParams.get('backend');
            const isRelay = parsed.searchParams.has('relay');

            if (!code) {
                throw new Error('Missing code parameter in deep link');
            }

            let backend = backendParam || undefined;

            if (!backend && api && stage) {
                backend = `https://${api}.execute-api.${INVITE_BACKEND_REGION}.amazonaws.com/${stage}`;
            }

            const query = [`code=${encodeURIComponent(code)}`, 'provider=invite', 'version=2'];
            if (isRelay) {
                query.push('relay=1');
            }
            if (backend) {
                query.push(`_backend=${encodeURIComponent(backend)}`);
            }
            parsed.searchParams.forEach((value, key) => {
                if (key !== 'code' && key !== 'api' && key !== 'stage' && key !== 'backend' && key !== 'relay') {
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

const PUSH_PARSE_BASE = 'http://chatic.local';

export interface PushNavigationData {
    link?: unknown;
    clickAction?: unknown;
    type?: unknown;
    payload?: unknown;
    cid?: unknown;
    sid?: unknown;
    chatId?: unknown;
    [key: string]: unknown;
}

const asString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const PUSH_CONTEXT_KEYS = ['cid', 'sid', 'chatId'] as const;

type PushContext = Partial<Record<(typeof PUSH_CONTEXT_KEYS)[number], string>>;

const extractPushContext = (data: PushNavigationData): PushContext => {
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

    return Object.fromEntries(PUSH_CONTEXT_KEYS.map(key => [key, asString(source[key])])) as PushContext;
};

const stripPushScheme = (link: string): string => {
    const match = link.match(/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\/(.*)$/);
    return match ? match[1] : link;
};

const ROOTED_PUSH_TYPES = new Set(['cloud']);

const PUSH_ROOT_PATH = '/';

const rootedPushPath = (data: PushNavigationData): string => {
    const { cid } = extractPushContext(data);
    return cid ? `${PUSH_ROOT_PATH}?cid=${encodeURIComponent(cid)}` : PUSH_ROOT_PATH;
};

export const resolvePushTapPath = (data: PushNavigationData | undefined | null): string | null => {
    if (!data) {
        return null;
    }

    const link = asString(data.link) ?? asString(data.clickAction);
    if (!link) {
        const type = asString(data.type);
        return type && ROOTED_PUSH_TYPES.has(type) ? rootedPushPath(data) : null;
    }

    const context = extractPushContext(data);

    let url: URL;
    try {
        url = new URL(stripPushScheme(link), PUSH_PARSE_BASE);
    } catch {
        return null;
    }

    const existingQuery = url.search.startsWith('?') ? url.search.slice(1) : url.search;
    const query = existingQuery ? [existingQuery] : [];

    for (const key of PUSH_CONTEXT_KEYS) {
        const value = context[key];
        if (value && !url.searchParams.has(key)) {
            query.push(`${key}=${encodeURIComponent(value)}`);
        }
    }

    const search = query.length ? `?${query.join('&')}` : '';
    return `${url.pathname}${search}${url.hash}`;
};

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

export type NativeRouteState = {
    routes: Array<{ name: string; state?: unknown; params?: Record<string, string> }>;
};

export type DeepLinkResolution =
    | { kind: 'web'; path: string }
    | { kind: 'native'; state: NativeRouteState }
    | { kind: 'invalid'; error: string };

const reconstructDeepLinkUrl = (path: string): string => {
    if (path.startsWith('http://') || path.startsWith('https://') || path.includes('://')) {
        return path;
    }
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${getAppScheme()}://${cleanPath}`;
};

const buildNativeRouteState = (urlObj: URL, logger?: ILogService): NativeRouteState => {
    const segments = urlObj.pathname.split('/').filter(Boolean);
    const root = segments[0]?.toLowerCase();

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

    logger?.info('DEEPLINK', '[deeplinkUtils] Unknown native route, falling back to Main', {
        pathname: urlObj.pathname,
    });
    return { routes: [{ name: 'Main' }] };
};

const resolveWebPath = (fullUrl: string): string => {
    const converted = convertShortUrlWithEnvsSync(fullUrl).url;
    if (converted.startsWith('/')) {
        return converted;
    }
    const parsed = parseUrlSafe(converted);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
};

const readNativeTarget = (urlObj: URL): string | null => {
    try {
        return urlObj.searchParams.get('target');
    } catch {
        return null;
    }
};

const logDamagedInviteLink = (fullUrl: string, logger?: ILogService): void => {
    const normalized = normalizeSchemeForParsing(fullUrl);
    if (!logger || !isEncodedInviteUrl(normalized)) {
        return;
    }
    const { target, failedAt, length, ignoredChars } = readInviteLink(normalized);
    if (!target) {
        logger.warn('DEEPLINK', '[deeplinkUtils] encoded invite link unreadable', { failedAt, length, ignoredChars });
    } else if (ignoredChars > 0) {
        logger.info('DEEPLINK', '[deeplinkUtils] encoded invite link read past trailing characters', {
            length,
            ignoredChars,
        });
    }
};

export const resolveDeepLink = (rawUrl: string, logger?: ILogService): DeepLinkResolution => {
    const fullUrl = reconstructDeepLinkUrl(rawUrl);
    logger?.info('DEEPLINK', '[deeplinkUtils] resolveDeepLink', { rawUrl, fullUrl });

    if (!isValidDeepLink(fullUrl)) {
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

    logDamagedInviteLink(fullUrl, logger);

    const httpsForm = normalizeSchemeForParsing(fullUrl);
    const pageLink = readSubWebViewAppLink(httpsForm);
    if (isSubWebViewAppLinkAttempt(httpsForm) && !pageLink) {
        const error = 'Invalid sub WebView page link';
        logger?.warn('DEEPLINK', '[deeplinkUtils] resolveDeepLink invalid page link, dropping', { fullUrl });
        return { kind: 'invalid', error };
    }

    if (pageLink) {
        return { kind: 'web', path: subWebViewLinkPath(pageLink) };
    }

    try {
        const urlObj = parseUrlSafe(fullUrl);
        const target = readNativeTarget(urlObj);
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

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

export interface RouteParams {
    url?: string;
    error?: string;
}

export interface RouteState {
    name: 'Main';
    params?: RouteParams;
}

export interface NavigationState {
    routes: [
        {
            name: 'Main';
            state: {
                routes: [RouteState];
            };
        },
    ];
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
 * Converts a deep link into the URL handed to the WebView route param.
 *
 * The frontend host is intentionally omitted here: the WebView always loads from WEBVIEW_URL
 * (the env-configured `VITE_WEBVIEW_BASE_URL`), and `toLocalUrl` re-applies that host downstream.
 * Computing a host here would be dead work, so we only shape the path/query.
 *
 * - New-pattern invite links (`/s?code=…&api=…&stage=…`) are expanded to the home route with the
 *   invite markers (`provider=invite&version=2`) and a resolved `_backend`, returned as a relative URL.
 * - Everything else passes through unchanged; `toLocalUrl` normalizes scheme/host at consumption time.
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

/**
 * Maps a deep link path to a nested React Navigation state containing parsed parameters
 */
export const getRouteStateFromDeepLinkPath = (path: string, logger?: ILogService): any => {
    let fullUrl = path;
    if (!path.startsWith('http://') && !path.startsWith('https://') && !path.includes('://')) {
        const scheme = Config.VITE_ENV === 'DEV' ? 'chatic-dev' : 'chatic';
        const cleanPath = path.startsWith('/') ? path.slice(1) : path;
        fullUrl = `${scheme}://${cleanPath}`;
    }

    logger?.info('DEEPLINK', '[deeplinkUtils] Reconstructed deep link URL', { path, fullUrl });

    if (!isValidDeepLink(fullUrl)) {
        // Surface why validation failed (scheme/domain) so an unroutable link stays traceable.
        let hostname: string | undefined;
        try {
            hostname = parseUrlSafe(fullUrl).hostname;
        } catch {
            hostname = undefined;
        }
        logger?.warn('DEEPLINK', '[deeplinkUtils] Invalid deep link, dropping', {
            fullUrl,
            scheme: fullUrl.split('://')[0],
            hostname,
        });
        return undefined;
    }

    try {
        const urlObj = parseUrlSafe(fullUrl);
        const target = urlObj.searchParams.get('target');
        logger?.info('DEEPLINK', '[deeplinkUtils] Parsed deep link', {
            pathname: urlObj.pathname,
            target: target ?? '(web)',
            isNewPatternInvite: isNewPatternInviteUrl(fullUrl),
        });

        // 1. Native Routing Case
        if (target === 'native') {
            const segments = urlObj.pathname.split('/').filter(Boolean);
            const root = segments[0]?.toLowerCase();

            // Extract all other parameters as params
            const routeParams: Record<string, string> = {};
            urlObj.searchParams.forEach((value, key) => {
                if (key !== 'target') {
                    routeParams[key] = value;
                }
            });

            if (root === 'debug') {
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
                ];
                const screenSegment = segments[1]?.toLowerCase();
                const matchedScreen = DEBUG_SCREENS.find(s => s.toLowerCase() === screenSegment) || 'Home';

                logger?.info('DEEPLINK', '[deeplinkUtils] Native route → Debug', {
                    screen: matchedScreen,
                    params: routeParams,
                });

                return {
                    routes: [
                        {
                            name: 'Debug',
                            state: {
                                routes: [
                                    {
                                        name: matchedScreen,
                                        params: Object.keys(routeParams).length > 0 ? routeParams : undefined,
                                    },
                                ],
                            },
                        },
                    ],
                };
            }

            if (root === 'main' && segments[1]?.toLowerCase() === 'modal') {
                logger?.info('DEEPLINK', '[deeplinkUtils] Native route → Modal', { params: routeParams });
                return {
                    routes: [
                        {
                            name: 'Main',
                            state: {
                                routes: [
                                    {
                                        name: 'Modal',
                                        params: Object.keys(routeParams).length > 0 ? routeParams : undefined,
                                    },
                                ],
                            },
                        },
                    ],
                };
            }

            // Fallback for unknown native routes: Send to MainScreen
            logger?.info('DEEPLINK', '[deeplinkUtils] Unknown native route, falling back to Main', {
                pathname: urlObj.pathname,
            });
            return {
                routes: [
                    {
                        name: 'Main',
                        state: {
                            routes: [
                                {
                                    name: 'Main',
                                },
                            ],
                        },
                    },
                ],
            };
        }

        // 2. Web WebView Routing Case (Default)
        if (isNewPatternInviteUrl(fullUrl)) {
            logger?.info('DEEPLINK', '[deeplinkUtils] Invite link params', {
                code: urlObj.searchParams.get('code'),
                api: urlObj.searchParams.get('api'),
                stage: urlObj.searchParams.get('stage'),
                backend: urlObj.searchParams.get('backend'),
            });
        }
        const converted = convertShortUrlWithEnvsSync(fullUrl);
        logger?.info('DEEPLINK', '[deeplinkUtils] Converted to WebView URL', {
            fullUrl,
            convertedUrl: converted.url,
        });

        return {
            routes: [
                {
                    name: 'Main',
                    state: {
                        routes: [
                            {
                                name: 'Main',
                                params: {
                                    url: converted.url,
                                },
                            },
                        ],
                    },
                },
            ],
        };
    } catch (error) {
        logger?.error('DEEPLINK', '[deeplinkUtils] Deep link conversion failed', error);
        return {
            routes: [
                {
                    name: 'Main',
                    state: {
                        routes: [
                            {
                                name: 'Main',
                                params: {
                                    error: error instanceof Error ? error.message : 'Unknown error',
                                },
                            },
                        ],
                    },
                },
            ],
        };
    }
};

import Config from 'react-native-config';

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

export const FRONTEND_DOMAIN_PROD = 'dou.chatic.io';
export const FRONTEND_DOMAIN_DEV = 'dou-dev.chatic.io';
export const DEEPLINK_DOMAIN_PROD = 'app.chatic.io';
export const DEEPLINK_DOMAIN_DEV = 'app-dev.chatic.io';

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
 * Helper to determine frontend domain dynamically based on deep link URL
 */
export const getFrontendDomainForUrl = (url: string): string => {
    try {
        const lowerUrl = url.toLowerCase();
        if (lowerUrl.includes('dev') || lowerUrl.includes('chatic-dev')) {
            return FRONTEND_DOMAIN_DEV;
        }
    } catch {
        // Fallback to prod
    }
    return FRONTEND_DOMAIN_PROD;
};

/**
 * Extract path and search from custom scheme URL without relying on new URL().
 */
const parseCustomSchemeUrl = (url: string): { path: string; search: string } => {
    const afterScheme = url.replace(/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//, '');
    const queryIndex = afterScheme.indexOf('?');
    const pathPart = queryIndex >= 0 ? afterScheme.slice(0, queryIndex) : afterScheme;
    const searchPart = queryIndex >= 0 ? afterScheme.slice(queryIndex) : '';
    const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
    return { path, search: searchPart };
};

/**
 * Converts deep link URL to actual frontend URL
 */
export const convertDeepLinkToFrontendUrl = (deepLinkUrl: string): string => {
    try {
        const scheme = deepLinkUrl.split(':')[0];
        const frontendDomain = getFrontendDomainForUrl(deepLinkUrl);
        const frontendBaseUrl = `https://${frontendDomain}`;

        let path: string;
        let search: string;

        if (isCustomScheme(scheme)) {
            const result = parseCustomSchemeUrl(deepLinkUrl);
            path = result.path;
            search = result.search;
        } else {
            const parsed = parseUrlSafe(deepLinkUrl);
            path = parsed.pathname;
            search = parsed.search;
        }

        const normalizedPath = path.length > 1 ? path.replace(/\/$/, '') : path;
        const frontendUrl = `${frontendBaseUrl}${normalizedPath}${search}`;
        console.log('[UrlConverter] Deep link → Frontend:', deepLinkUrl, '→', frontendUrl);
        return frontendUrl;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[UrlConverter] Failed to convert URL:', message);
        return deepLinkUrl;
    }
};

/**
 * Converts short URL to frontend URL and returns $envs for WebView injection
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
                backend = `https://${api}.execute-api.ap-northeast-2.amazonaws.com/${stage}`;
            }

            const frontendDomain = getFrontendDomainForUrl(url);
            const frontendBaseUrl = `https://${frontendDomain}`;
            let expandedUrl = `${frontendBaseUrl}/auth/login?code=${encodeURIComponent(code)}&provider=invite&version=2`;

            if (backend) {
                expandedUrl += `&_backend=${encodeURIComponent(backend)}`;
            }

            // Forward any other query parameters from the deep link URL directly
            const expandedUrlObj = new URL(expandedUrl);
            parsed.searchParams.forEach((value, key) => {
                if (key !== 'code' && key !== 'api' && key !== 'stage' && key !== 'backend') {
                    expandedUrlObj.searchParams.set(key, value);
                }
            });

            console.log('[UrlConverter] New pattern dynamic link parsed:', url, '→', expandedUrlObj.toString());

            return {
                url: expandedUrlObj.toString(),
            };
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

    const scheme = url.split('://')[0];
    if (isCustomScheme(scheme)) {
        return { url: convertDeepLinkToFrontendUrl(url) };
    }

    return { url };
};

/**
 * Maps a deep link path to a nested React Navigation state containing parsed parameters
 */
export const getRouteStateFromDeepLinkPath = (path: string): any => {
    let fullUrl = path;
    if (!path.startsWith('http://') && !path.startsWith('https://') && !path.includes('://')) {
        const scheme = Config.VITE_ENV === 'DEV' ? 'chatic-dev' : 'chatic';
        const cleanPath = path.startsWith('/') ? path.slice(1) : path;
        fullUrl = `${scheme}://${cleanPath}`;
    }

    console.log('[AppLinking] Reconstructed URL in getRouteStateFromDeepLinkPath:', fullUrl);

    if (!isValidDeepLink(fullUrl)) {
        console.warn('[AppLinking] Invalid deep link parsed in getRouteStateFromDeepLinkPath:', fullUrl);
        return undefined;
    }

    try {
        const urlObj = parseUrlSafe(fullUrl);
        const target = urlObj.searchParams.get('target');

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

                console.log(
                    `[AppLinking] Routing natively to Debug Stack -> ${matchedScreen} with params:`,
                    routeParams
                );

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
                console.log(`[AppLinking] Routing natively to Main Stack -> Modal with params:`, routeParams);
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
            console.log(`[AppLinking] Unknown native route '${urlObj.pathname}', falling back to MainScreen`);
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
        const converted = convertShortUrlWithEnvsSync(fullUrl);
        console.log('[AppLinking] Successfully converted URL in getRouteStateFromDeepLinkPath:', converted);

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
        console.error('[AppLinking] Failed to convert URL in getRouteStateFromDeepLinkPath:', error);
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

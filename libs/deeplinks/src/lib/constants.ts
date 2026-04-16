/**
 * Deep Link Constants
 *
 * Centralized configuration for deep link domains and schemes.
 * Used by parser, urlConverter, and manager.
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

/**
 * Check if running in development environment
 * Supports both web (process.env) and React Native (react-native-config)
 */
const getIsDev = (): boolean => {
    // React Native: use react-native-config
    try {
        const Config = require('react-native-config').default;
        if (Config?.VITE_ENV) {
            return Config.VITE_ENV === 'DEV';
        }
    } catch {
        // Not in React Native environment
    }

    // Web: use process.env
    if (typeof process !== 'undefined' && process.env?.VITE_ENV) {
        return process.env.VITE_ENV === 'DEV';
    }

    // Default to production
    return false;
};

const isDev = getIsDev();

/** Frontend domain for WebView navigation */
export const FRONTEND_DOMAIN = isDev ? 'dou-dev.chatic.io' : 'dou.chatic.io';

/** Frontend base URL (protocol + domain) */
export const FRONTEND_BASE_URL = isDev ? 'http://192.168.1.13:5003' : `https://${FRONTEND_DOMAIN}`;

/** Deep link domain for URL generation */
export const DEEPLINK_DOMAIN = isDev ? 'app-dev.chatic.io' : 'app.chatic.io';

/** Time constants */
export const ONE_HOUR_MS = 60 * 60 * 1000;

/** Firestore collection name for deferred deep links */
export const DEFERRED_LINKS_COLLECTION = 'deferredDeepLinks';

/** TTL for deferred deep links in hours */
export const LINK_TTL_HOURS = 1;

/** Type guard for valid schemes */
export const isValidScheme = (scheme: string): scheme is (typeof VALID_SCHEMES)[number] =>
    (VALID_SCHEMES as readonly string[]).includes(scheme);

/** Type guard for custom schemes */
export const isCustomScheme = (scheme: string): scheme is (typeof CUSTOM_SCHEMES)[number] =>
    (CUSTOM_SCHEMES as readonly string[]).includes(scheme);

/** Type guard for valid domains */
export const isValidDomain = (domain: string): domain is (typeof VALID_DOMAINS)[number] =>
    (VALID_DOMAINS as readonly string[]).includes(domain);

/** Type guard for deep link domains */
export const isDeepLinkDomain = (domain: string): domain is (typeof DEEP_LINK_DOMAINS)[number] =>
    (DEEP_LINK_DOMAINS as readonly string[]).includes(domain);

/**
 * Hash fingerprint components into 8-character hex string
 * MUST be identical in both mobile app and web landing page
 *
 * @param components - Pipe-separated string (e.g., "ip|timezone|locale")
 * @returns 8-character hex hash
 */
export const hashFingerprintComponents = (components: string): string => {
    let hash = 0;
    for (let i = 0; i < components.length; i++) {
        const char = components.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
};

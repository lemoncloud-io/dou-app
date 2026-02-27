/**
 * Deep Link Constants
 *
 * Centralized configuration for deep link domains and schemes.
 * Used by parser, urlConverter, and manager.
 */

/** Valid domains that can be used as deep link sources */
export const VALID_DOMAINS = ['app.chatic.io', 'app-dev.chatic.io', 'dou.chatic.io', 'chatic.io'] as const;

/** Valid URL schemes */
export const VALID_SCHEMES = ['chatic', 'chatic-dev', 'https', 'http'] as const;

/** Custom URL schemes (non-http) */
export const CUSTOM_SCHEMES = ['chatic', 'chatic-dev'] as const;

/** Deep link domains that need conversion to frontend domain */
export const DEEP_LINK_DOMAINS = ['app.chatic.io', 'app-dev.chatic.io'] as const;

/** Frontend domain for WebView navigation */
export const FRONTEND_DOMAIN = 'dou.chatic.io';

/** Time constants */
export const ONE_HOUR_MS = 60 * 60 * 1000;

/** Firestore collection name for deferred deep links */
export const DEFERRED_LINKS_COLLECTION = 'deferredDeepLinks';

/** TTL for deferred deep links in hours */
export const LINK_TTL_HOURS = 1;

/**
 * Deep Link URL Converter
 *
 * Converts deep link URLs to actual frontend URLs
 * - app.chatic.io -> dou.chatic.io
 * - chatic://path -> https://dou.chatic.io/path
 */

import { isShortUrl } from './parser';

const DEEP_LINK_DOMAIN = 'app.chatic.io';
const FRONTEND_DOMAIN = 'dou.chatic.io';
const CUSTOM_SCHEME = 'chatic';

/**
 * Converts deep link URL to actual frontend URL
 *
 * @param deepLinkUrl - Deep link URL (e.g., https://app.chatic.io/chat/123)
 * @returns Converted frontend URL (e.g., https://dou.chatic.io/chat/123)
 *
 * @example
 * convertDeepLinkToFrontendUrl('https://app.chatic.io/chat/123')
 * // Returns: 'https://dou.chatic.io/chat/123'
 *
 * convertDeepLinkToFrontendUrl('chatic://chat/123')
 * // Returns: 'https://dou.chatic.io/chat/123'
 */
export const convertDeepLinkToFrontendUrl = (deepLinkUrl: string): string => {
    try {
        const parsed = new URL(deepLinkUrl);
        const scheme = parsed.protocol.replace(':', '');

        let path: string;
        let search: string;

        if (scheme === CUSTOM_SCHEME) {
            // For custom scheme (chatic://), hostname is part of the path
            // e.g., chatic://chat/123 → hostname='chat', pathname='/123'
            // We need to combine them: /chat/123
            if (parsed.hostname) {
                path = '/' + parsed.hostname + parsed.pathname;
            } else {
                path = parsed.pathname;
            }
            search = parsed.search;
        } else {
            // For http/https, just use pathname
            path = parsed.pathname;
            search = parsed.search;
        }

        // Build frontend URL
        const frontendUrl = `https://${FRONTEND_DOMAIN}${path}${search}`;

        console.log('[UrlConverter] Deep link → Frontend:', deepLinkUrl, '→', frontendUrl);
        return frontendUrl;
    } catch (error) {
        console.error('[UrlConverter] Failed to convert URL:', error);
        return deepLinkUrl;
    }
};

/**
 * Converts short URL to frontend URL
 * For now, returns the URL as-is (short URL expansion to be implemented later)
 *
 * @param url - Potentially short URL
 * @returns Original URL or expanded URL
 */
export const convertShortUrlToFrontendUrl = async (url: string): Promise<string> => {
    // Check if it's a short URL
    if (!isShortUrl(url)) {
        return url;
    }

    // TODO: Implement short URL expansion via Firebase Firestore or API
    // For now, convert the short URL domain to frontend domain
    console.warn('[UrlConverter] Short URL expansion not implemented yet');

    try {
        const parsed = new URL(url);
        // Convert app.chatic.io/s/xxx to dou.chatic.io/s/xxx
        // The frontend should handle the short URL redirect
        if (parsed.hostname === DEEP_LINK_DOMAIN) {
            return `https://${FRONTEND_DOMAIN}${parsed.pathname}${parsed.search}`;
        }
        return url;
    } catch {
        return url;
    }
};

/**
 * Check if URL needs conversion (is a deep link domain or custom scheme)
 */
export const needsConversion = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        const scheme = parsed.protocol.replace(':', '');

        if (scheme === CUSTOM_SCHEME) {
            return true;
        }

        if (parsed.hostname === DEEP_LINK_DOMAIN) {
            return true;
        }

        return false;
    } catch {
        return false;
    }
};

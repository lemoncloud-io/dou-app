/**
 * Deep Link URL Converter
 *
 * Converts deep link URLs to actual frontend URLs
 * - app.chatic.io -> dou.chatic.io
 * - chatic://path -> https://dou.chatic.io/path
 */

import { FRONTEND_DOMAIN, isCustomScheme, isDeepLinkDomain } from './constants';
import { getInviteLink } from './inviteLink';
import { isShortUrl } from './parser';

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

        if (isCustomScheme(scheme)) {
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
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[UrlConverter] Failed to convert URL:', message);
        return deepLinkUrl;
    }
};

/**
 * Converts short URL to frontend URL by looking up invite link in Firestore
 *
 * @param url - Potentially short URL (e.g., https://app.chatic.io/s/abc123)
 * @returns Expanded frontend URL with invite data, or domain-converted URL as fallback
 *
 * @example
 * convertShortUrlToFrontendUrl('https://app.chatic.io/s/1000028')
 * // Returns: 'https://dou.chatic.io/users/1000028' (from invite data)
 */
export const convertShortUrlToFrontendUrl = async (url: string): Promise<string> => {
    if (!isShortUrl(url)) {
        return url;
    }

    try {
        const parsed = new URL(url);
        // Extract short code from path: /s/abc123 -> abc123
        const pathParts = parsed.pathname.split('/');
        const shortCode = pathParts[pathParts.length - 1];

        if (!shortCode) {
            console.warn('[UrlConverter] No short code found in URL:', url);
            return convertDeepLinkToFrontendUrl(url);
        }

        // Look up invite link in Firestore
        const inviteLink = await getInviteLink(shortCode);

        if (inviteLink?.invite) {
            // Build frontend URL from invite data
            const { userId } = inviteLink.invite;
            if (userId) {
                const expandedUrl = `https://${FRONTEND_DOMAIN}/users/${userId}`;
                console.log('[UrlConverter] Short URL expanded:', url, '→', expandedUrl);
                return expandedUrl;
            }
        }

        // Fallback: convert domain but keep short URL path
        // Frontend will handle the /s/{code} route
        console.log('[UrlConverter] Short URL fallback to domain conversion:', url);
        if (isDeepLinkDomain(parsed.hostname)) {
            return `https://${FRONTEND_DOMAIN}${parsed.pathname}${parsed.search}`;
        }
        return url;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[UrlConverter] Error expanding short URL:', message);
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

        if (isCustomScheme(scheme)) {
            return true;
        }

        if (isDeepLinkDomain(parsed.hostname)) {
            return true;
        }

        return false;
    } catch {
        return false;
    }
};

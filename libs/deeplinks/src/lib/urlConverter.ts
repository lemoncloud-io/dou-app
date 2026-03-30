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

        // Remove trailing slash to prevent short code extraction failure
        // (Hermes URL parser may add trailing slash to pathname)
        const normalizedPath = path.length > 1 ? path.replace(/\/$/, '') : path;

        // Build frontend URL
        const frontendUrl = `https://${FRONTEND_DOMAIN}${normalizedPath}${search}`;

        console.log('[UrlConverter] Deep link → Frontend:', deepLinkUrl, '→', frontendUrl);
        return frontendUrl;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[UrlConverter] Failed to convert URL:', message);
        return deepLinkUrl;
    }
};

/**
 * Service endpoints from invite.$envs
 */
export interface ServiceEndpoints {
    backend?: string;
    wss?: string;
}

/**
 * Result of converting short URL with environment info
 */
export interface ConvertedUrlResult {
    url: string;
    envs?: ServiceEndpoints;
}

/**
 * Extract path and search from a Location URL
 *
 * @param locationUrl - Full URL from invite.Location
 * @returns Path and search portion (e.g., /auth/login?code=xxx&provider=invite)
 */
const extractPathFromLocation = (locationUrl: string): string | null => {
    try {
        const parsed = new URL(locationUrl);
        return `${parsed.pathname}${parsed.search}`;
    } catch {
        return null;
    }
};

/**
 * Converts short URL to frontend URL by looking up invite link in Firestore
 *
 * @param url - Potentially short URL (e.g., https://app.chatic.io/s/abc123)
 * @returns Expanded frontend URL with invite data, or domain-converted URL as fallback
 *
 * @example
 * convertShortUrlToFrontendUrl('https://app-dev.chatic.io/s/1000042')
 * // Returns: 'https://dou-dev.chatic.io/auth/login?code=invt:910014:xxx&provider=invite'
 */
export const convertShortUrlToFrontendUrl = async (url: string): Promise<string> => {
    if (!isShortUrl(url)) {
        return url;
    }

    try {
        const parsed = new URL(url);
        // Extract short code from path: /s/abc123 -> abc123
        // Remove trailing slash before splitting (Hermes URL parser may add one)
        const normalizedPath = parsed.pathname.replace(/\/$/, '');
        const pathParts = normalizedPath.split('/');
        const shortCode = pathParts[pathParts.length - 1];

        if (!shortCode) {
            console.warn('[UrlConverter] No short code found in URL:', url);
            return convertDeepLinkToFrontendUrl(url);
        }

        // Look up invite link in Firestore
        const inviteLink = await getInviteLink(shortCode);

        if (inviteLink?.invite) {
            // Use Location field from invite data if available
            // Location contains the full auth URL with invite code
            const invite = inviteLink.invite as {
                Location?: string;
                userId?: string;
                $envs?: ServiceEndpoints;
            };

            if (invite.Location) {
                const pathAndSearch = extractPathFromLocation(invite.Location);
                if (pathAndSearch) {
                    const expandedUrl = `https://${FRONTEND_DOMAIN}${pathAndSearch}`;
                    console.log('[UrlConverter] Short URL expanded from Location:', url, '→', expandedUrl);
                    return expandedUrl;
                }
            }

            // Fallback to userId-based URL if Location is not available
            if (invite.userId) {
                const expandedUrl = `https://${FRONTEND_DOMAIN}/users/${invite.userId}`;
                console.log('[UrlConverter] Short URL expanded from userId:', url, '→', expandedUrl);
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
 * Converts short URL to frontend URL and returns $envs for WebView injection
 *
 * @param url - Potentially short URL (e.g., https://app.chatic.io/s/abc123)
 * @returns Object with expanded URL and optional $envs for injection
 *
 * @example
 * const result = await convertShortUrlWithEnvs('https://app-dev.chatic.io/s/1000042');
 * // result.url = 'https://dou-dev.chatic.io/auth/login?code=invt:xxx&provider=invite'
 * // result.envs = { backend: 'https://...', wss: 'wss://...' }
 */
export const convertShortUrlWithEnvs = async (url: string): Promise<ConvertedUrlResult> => {
    if (!isShortUrl(url)) {
        return { url };
    }

    try {
        const parsed = new URL(url);
        // Remove trailing slash before splitting (Hermes URL parser may add one)
        const normalizedPath = parsed.pathname.replace(/\/$/, '');
        const pathParts = normalizedPath.split('/');
        const shortCode = pathParts[pathParts.length - 1];

        if (!shortCode) {
            console.warn('[UrlConverter] No short code found in URL:', url);
            throw new Error(`No short code in URL: ${url}`);
        }

        console.log('[UrlConverter] Looking up short code:', shortCode, 'from URL:', url);
        const inviteLink = await getInviteLink(shortCode);
        console.log('[UrlConverter] Firestore result:', inviteLink ? 'found' : 'not found');

        if (inviteLink?.invite) {
            const invite = inviteLink.invite as {
                Location?: string;
                userId?: string;
                $envs?: ServiceEndpoints;
            };

            if (invite.Location) {
                const pathAndSearch = extractPathFromLocation(invite.Location);
                if (pathAndSearch) {
                    const expandedUrl = `https://${FRONTEND_DOMAIN}${pathAndSearch}`;
                    console.log('[UrlConverter] Short URL expanded with envs:', url, '→', expandedUrl);
                    return { url: expandedUrl, envs: invite.$envs };
                }
            }

            if (invite.userId) {
                const expandedUrl = `https://${FRONTEND_DOMAIN}/users/${invite.userId}`;
                console.log('[UrlConverter] Short URL expanded from userId with envs:', url, '→', expandedUrl);
                return { url: expandedUrl, envs: invite.$envs };
            }

            // invite exists but has neither Location nor userId
            console.warn('[UrlConverter] Invite found but missing Location and userId:', shortCode);
        }

        console.warn('[UrlConverter] Short URL expansion failed for code:', shortCode);
        // Throw to propagate the actual failure reason to the manager
        throw new Error(
            inviteLink ? `Invite data incomplete (code: ${shortCode})` : `Invite not found (code: ${shortCode})`
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[UrlConverter] Error expanding short URL:', message);
        // Re-throw so the manager can show the actual error to the user
        throw error;
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

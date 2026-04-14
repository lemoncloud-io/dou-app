/**
 * Deep Link URL Converter
 *
 * Converts deep link URLs to actual frontend URLs
 * - app.chatic.io -> dou.chatic.io
 * - chatic://path -> https://dou.chatic.io/path
 */

import { FRONTEND_BASE_URL, isCustomScheme, isDeepLinkDomain } from './constants';
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
/**
 * Extract path and search from custom scheme URL without relying on new URL().
 * Hermes URL parser does not correctly handle custom schemes like chatic-dev://s/xxx.
 * Manual parsing: strip scheme prefix, ensure leading slash.
 */
const parseCustomSchemeUrl = (url: string): { path: string; search: string } => {
    // chatic-dev://s/abc?foo=bar → s/abc?foo=bar
    const afterScheme = url.replace(/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//, '');
    const queryIndex = afterScheme.indexOf('?');
    const pathPart = queryIndex >= 0 ? afterScheme.slice(0, queryIndex) : afterScheme;
    const searchPart = queryIndex >= 0 ? afterScheme.slice(queryIndex) : '';
    const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
    return { path, search: searchPart };
};

export const convertDeepLinkToFrontendUrl = (deepLinkUrl: string): string => {
    try {
        const scheme = deepLinkUrl.split(':')[0];

        let path: string;
        let search: string;

        if (isCustomScheme(scheme)) {
            // Manual parsing — Hermes new URL() breaks custom scheme hostname/pathname
            const result = parseCustomSchemeUrl(deepLinkUrl);
            path = result.path;
            search = result.search;
        } else {
            const parsed = new URL(deepLinkUrl);
            path = parsed.pathname;
            search = parsed.search;
        }

        // Remove trailing slash to prevent short code extraction failure
        const normalizedPath = path.length > 1 ? path.replace(/\/$/, '') : path;

        const frontendUrl = `${FRONTEND_BASE_URL}${normalizedPath}${search}`;
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
 * Site info from invite.site$
 */
export interface InviteSiteInfo {
    id?: string;
    name?: string;
}

/**
 * Result of converting short URL with environment info
 */
export interface ConvertedUrlResult {
    url: string;
    envs?: ServiceEndpoints;
    site?: InviteSiteInfo;
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
                site$?: InviteSiteInfo;
                siteId?: string;
            };

            const site: InviteSiteInfo | undefined =
                invite.site$ ?? (invite.siteId ? { id: invite.siteId } : undefined);

            if (invite.Location) {
                const pathAndSearch = extractPathFromLocation(invite.Location);
                if (pathAndSearch) {
                    const expandedUrl = `${FRONTEND_BASE_URL}${pathAndSearch}`;
                    console.log('[UrlConverter] Short URL expanded with envs:', url, '→', expandedUrl);
                    return { url: expandedUrl, envs: invite.$envs, site };
                }
            }

            if (invite.userId) {
                const expandedUrl = `${FRONTEND_BASE_URL}/users/${invite.userId}`;
                console.log('[UrlConverter] Short URL expanded from userId with envs:', url, '→', expandedUrl);
                return { url: expandedUrl, envs: invite.$envs, site };
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
        // Check custom scheme first without new URL() — Hermes may fail to parse custom schemes
        const scheme = url.split(':')[0];
        if (isCustomScheme(scheme)) {
            return true;
        }

        const parsed = new URL(url);
        if (isDeepLinkDomain(parsed.hostname)) {
            return true;
        }

        return false;
    } catch {
        return false;
    }
};

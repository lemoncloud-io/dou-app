/**
 * useWebRedirect Hook
 *
 * Handles web browser redirect.
 * Fetches short link from Firebase and redirects to web app.
 */

import { useEffect, useState, useCallback } from 'react';

import { WEB_CONFIG } from '../constants';

import type { DeepLinkInfo } from '../types';

interface UseWebRedirectResult {
    loading: boolean;
    redirect: () => void;
}

/**
 * Extract short code from path (e.g., "/s/1000052" -> "1000052")
 */
const extractShortCode = (path: string): string | null => {
    const match = path.match(/^\/s\/([^/?]+)/);
    return match ? match[1] : null;
};

/**
 * Check if URL matches the new dynamic invite URL pattern.
 *
 * On the `/s` entry point a `code` is all it takes: the cloud form adds an address (`api`+`stage` or
 * `backend`), and the relay form adds nothing at all — the relay server has no address to carry, and
 * the `relay` flag is optional. Requiring an address or the flag here silently rejected code-only
 * relay links, which then fell through to the "unsupported deep link" dead end.
 *
 * The `/s` gate matters: it keeps any other page that happens to carry a `code` param — an OAuth
 * callback, most obviously — out of the invite branch.
 */
export const isNewPattern = (urlStr: string): boolean => {
    try {
        const url = new URL(urlStr);
        const isSPath = url.pathname === '/s' || url.pathname === '/s/';
        return isSPath && url.searchParams.has('code');
    } catch {
        return false;
    }
};

/**
 * Hook for web redirect functionality
 *
 * @param deepLinkInfo - Deep link info from useDeepLinkInfo
 * @param autoRedirect - Whether to auto-redirect on mount
 */
export const useWebRedirect = (deepLinkInfo: DeepLinkInfo, autoRedirect: boolean): UseWebRedirectResult => {
    const [loading, setLoading] = useState(false);

    const shortCode = extractShortCode(deepLinkInfo.fullPath);

    const redirect = useCallback(async () => {
        if (isNewPattern(deepLinkInfo.deepLinkUrl)) {
            setLoading(true);
            try {
                const url = new URL(deepLinkInfo.deepLinkUrl);
                const code = url.searchParams.get('code') || '';
                const api = url.searchParams.get('api') || '';
                const stage = url.searchParams.get('stage') || '';
                const backendParam = url.searchParams.get('backend') || '';
                // No address param at all means relay: the relay server has none to carry, so the
                // `relay` flag is optional on the way in. We still emit an explicit `relay=1` below.
                const hasAddress = !!backendParam || !!api || !!stage;
                const isRelay = url.searchParams.has('relay') || !hasAddress;

                let backend = backendParam || '';
                if (!backend && api && stage) {
                    backend = `https://${api}.execute-api.ap-northeast-2.amazonaws.com/${stage}`;
                }

                // Relay links get the explicit `relay=1` marker instead of a `_backend`; the web gates
                // on the marker rather than inferring relay from a missing address.
                const target = isRelay ? 'relay=1' : `_backend=${encodeURIComponent(backend)}`;
                const webBase = `${WEB_CONFIG.protocol}://${WEB_CONFIG.domain}`;
                const redirectUrl = `${webBase}/auth/login?code=${encodeURIComponent(code)}&provider=invite&version=2&${target}`;

                console.log('[WebRedirect] Direct redirect for new pattern:', redirectUrl);
                window.location.href = redirectUrl;
            } catch (err) {
                console.error('[WebRedirect] Error redirecting new pattern:', err);
                setLoading(false);
            }
            return;
        }

        if (shortCode) {
            console.error('[WebRedirect] Old style short links are no longer supported');
            return;
        }

        console.error('[WebRedirect] Invalid or unsupported deep link');
    }, [shortCode, deepLinkInfo]);

    // Auto-redirect when enabled
    useEffect(() => {
        const isNew = isNewPattern(deepLinkInfo.deepLinkUrl);
        if (autoRedirect && (shortCode || isNew)) {
            void redirect();
        }
    }, [autoRedirect, shortCode, redirect, deepLinkInfo]);

    return { loading, redirect };
};

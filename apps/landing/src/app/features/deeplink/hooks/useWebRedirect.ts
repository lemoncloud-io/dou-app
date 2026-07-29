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
 * Accepts the cloud form (`code` + `api`/`backend`) and the relay form (`code` + a bare `relay`
 * flag, which carries no backend address). The flag is detected by presence: `&relay` parses to an
 * empty-string value, so `get('relay')` is falsy for a valid relay link.
 */
const isNewPattern = (urlStr: string): boolean => {
    try {
        const url = new URL(urlStr);
        const hasCode = url.searchParams.has('code');
        const hasApi = url.searchParams.has('api') || url.searchParams.has('backend');
        const hasRelay = url.searchParams.has('relay');
        return !!(hasCode && (hasApi || hasRelay));
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
                const isRelay = url.searchParams.has('relay');

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

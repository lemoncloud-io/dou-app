/**
 * useWebRedirect Hook
 *
 * Handles web browser redirect.
 * Fetches short link from Firebase and redirects to web app.
 */

import { useEffect, useState, useCallback } from 'react';

import { WEB_CONFIG } from '../constants';
import { fetchShortLink } from '../utils';

import type { ShortLinkDocument, DeepLinkInfo } from '../types';

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
 * Build web redirect URL with envs as query params
 */
const buildRedirectUrl = (doc: ShortLinkDocument): string => {
    const baseUrl = doc.invite.Location;

    if (!baseUrl) {
        // Fallback: construct URL manually
        const webBase = `${WEB_CONFIG.protocol}://${WEB_CONFIG.domain}`;
        const code = doc.invite.code;
        return `${webBase}/auth/login?code=invt:${doc.invite.channelId}:${code}&provider=invite`;
    }

    // Replace domain in Location URL to use configured web domain
    const url = new URL(baseUrl);
    url.host = WEB_CONFIG.domain;
    url.protocol = `${WEB_CONFIG.protocol}:`;

    // Add envs as query params for web app to pick up
    if (doc.invite.$envs?.backend) {
        url.searchParams.set('_backend', doc.invite.$envs.backend);
    }
    if (doc.invite.$envs?.wss) {
        url.searchParams.set('_wss', doc.invite.$envs.wss);
    }

    return url.toString();
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
        if (!shortCode) {
            console.error('[WebRedirect] Invalid short code');
            return;
        }

        setLoading(true);

        try {
            const doc = await fetchShortLink(shortCode);

            if (!doc) {
                console.error(`[WebRedirect] Short link not found: ${shortCode}`);
                setLoading(false);
                return;
            }

            const redirectUrl = buildRedirectUrl(doc);
            console.log('[WebRedirect] Redirecting to:', redirectUrl);
            window.location.href = redirectUrl;
        } catch (err) {
            console.error('[WebRedirect] Error:', err);
            setLoading(false);
        }
    }, [shortCode]);

    // Auto-redirect when enabled
    useEffect(() => {
        if (autoRedirect && shortCode) {
            void redirect();
        }
    }, [autoRedirect, shortCode, redirect]);

    return { loading, redirect };
};

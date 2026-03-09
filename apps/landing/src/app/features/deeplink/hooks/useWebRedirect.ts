/**
 * useWebRedirect Hook
 *
 * Handles web browser redirect for desktop users.
 * Fetches short link from Firebase and redirects to web app.
 */

import { useEffect, useState, useCallback } from 'react';

import { WEB_CONFIG } from '../constants';
import { fetchShortLink } from '../utils';

import type { ShortLinkDocument, DeepLinkInfo } from '../types';

interface UseWebRedirectState {
    loading: boolean;
    error: string | null;
    document: ShortLinkDocument | null;
}

interface UseWebRedirectResult extends UseWebRedirectState {
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
    url.host = WEB_CONFIG.domain; // Use host (includes port) instead of hostname
    url.protocol = `${WEB_CONFIG.protocol}:`; // Protocol needs colon suffix

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
 * @param enabled - Whether to enable auto-fetch (for desktop only)
 */
export const useWebRedirect = (deepLinkInfo: DeepLinkInfo, enabled: boolean): UseWebRedirectResult => {
    const [state, setState] = useState<UseWebRedirectState>({
        loading: false,
        error: null,
        document: null,
    });

    const shortCode = extractShortCode(deepLinkInfo.fullPath);

    const fetchAndRedirect = useCallback(async () => {
        if (!shortCode) {
            setState({
                loading: false,
                error: 'Invalid short code',
                document: null,
            });
            return;
        }

        setState(prev => ({ ...prev, loading: true, error: null }));

        try {
            const doc = await fetchShortLink(shortCode);

            if (!doc) {
                setState({
                    loading: false,
                    error: `Short link not found: ${shortCode}`,
                    document: null,
                });
                return;
            }

            setState({
                loading: false,
                error: null,
                document: doc,
            });

            // Build and navigate to redirect URL
            const redirectUrl = buildRedirectUrl(doc);
            console.log('[WebRedirect] Redirecting to:', redirectUrl);
            window.location.href = redirectUrl;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.error('[WebRedirect] Error:', err);
            setState({
                loading: false,
                error: message,
                document: null,
            });
        }
    }, [shortCode]);

    // Auto-fetch when enabled (for desktop)
    useEffect(() => {
        if (enabled && shortCode) {
            void fetchAndRedirect();
        }
    }, [enabled, shortCode, fetchAndRedirect]);

    return {
        ...state,
        redirect: fetchAndRedirect,
    };
};

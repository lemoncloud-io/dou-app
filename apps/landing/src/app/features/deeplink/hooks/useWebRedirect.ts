import { useEffect, useState, useCallback } from 'react';

import { decodeInviteLink, isEncodedInviteUrl } from '@chatic/shared';

import { WEB_CONFIG } from '../../../config/links';

import type { DeepLinkInfo } from '../types';

interface UseWebRedirectResult {
    loading: boolean;
    redirect: () => void;
}

const extractShortCode = (path: string): string | null => {
    const match = path.match(/^\/s\/([^/?]+)/);
    return match ? match[1] : null;
};

export const isNewPattern = (urlStr: string): boolean => {
    try {
        const url = new URL(urlStr);
        const isSPath = url.pathname === '/s' || url.pathname === '/s/';
        return isSPath && url.searchParams.has('code');
    } catch {
        return false;
    }
};

export const useWebRedirect = (deepLinkInfo: DeepLinkInfo, autoRedirect: boolean): UseWebRedirectResult => {
    const [loading, setLoading] = useState(false);

    const shortCode = extractShortCode(deepLinkInfo.fullPath);

    const redirect = useCallback(async () => {
        if (isEncodedInviteUrl(deepLinkInfo.deepLinkUrl)) {
            setLoading(true);
            const target = decodeInviteLink(deepLinkInfo.deepLinkUrl);
            if (!target) {
                console.error('[WebRedirect] Unreadable encoded invite link');
                setLoading(false);
                return;
            }

            const query = [`code=${encodeURIComponent(target.code)}`, 'provider=invite', 'version=2'];
            if (target.relay) {
                query.push('relay=1');
            } else if (target.backend) {
                query.push(`_backend=${encodeURIComponent(target.backend)}`);
            }

            const webBase = `${WEB_CONFIG.protocol}://${WEB_CONFIG.domain}`;
            const redirectUrl = `${webBase}/auth/login?${query.join('&')}`;

            console.log('[WebRedirect] Direct redirect for encoded invite link:', redirectUrl);
            window.location.href = redirectUrl;
            return;
        }

        if (isNewPattern(deepLinkInfo.deepLinkUrl)) {
            setLoading(true);
            try {
                const url = new URL(deepLinkInfo.deepLinkUrl);
                const code = url.searchParams.get('code') || '';
                const api = url.searchParams.get('api') || '';
                const stage = url.searchParams.get('stage') || '';
                const backendParam = url.searchParams.get('backend') || '';
                const hasAddress = !!backendParam || !!api || !!stage;
                const isRelay = url.searchParams.has('relay') || !hasAddress;

                let backend = backendParam || '';
                if (!backend && api && stage) {
                    backend = `https://${api}.execute-api.ap-northeast-2.amazonaws.com/${stage}`;
                }

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

    useEffect(() => {
        const isNew = isNewPattern(deepLinkInfo.deepLinkUrl);
        const isEncoded = isEncodedInviteUrl(deepLinkInfo.deepLinkUrl);
        if (autoRedirect && (shortCode || isNew || isEncoded)) {
            void redirect();
        }
    }, [autoRedirect, shortCode, redirect, deepLinkInfo]);

    return { loading, redirect };
};

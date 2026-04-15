import { useEffect, useRef } from 'react';
import { cloudCore, useWebCoreStore, webCore } from '@chatic/web-core';
import { getSocketSend, checkSocketHealth, useWebSocketV2Store } from '@chatic/socket';

const DEBOUNCE_MS = 300;

export const useForegroundTokenRefresh = (refreshToken: () => Promise<boolean>) => {
    const { isAuthenticated } = useWebCoreStore();
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') return;
            if (document.visibilityState !== 'visible') return;
            if (!isAuthenticated) return;

            // Debounce rapid visibility toggles
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            debounceTimer.current = setTimeout(() => {
                void handleForegroundResume();
            }, DEBOUNCE_MS);
        };

        const handleForegroundResume = async () => {
            // Socket health check and token refresh are independent — run in parallel
            const [socketStatus] = await Promise.all([
                checkSocketHealth().catch(() => 'reconnecting' as const),
                refreshToken().catch(() => false),
            ]);

            // Cloud token refresh (only when delegation token exists)
            if (cloudCore.getSelectedCloudId() && cloudCore.getDelegationToken()) {
                try {
                    await cloudCore.refreshToken();
                } catch (e) {
                    console.error('[ForegroundRefresh] Cloud token refresh failed', e);
                }
            }

            // Re-send auth only if socket was alive (not reconnecting)
            if (socketStatus === 'connected') {
                const send = getSocketSend();
                if (send) {
                    const { wssType } = useWebSocketV2Store.getState();
                    let token: string | undefined;
                    if (wssType === 'cloud') {
                        token = cloudCore.getIdentityToken();
                    } else {
                        token = (await webCore.getTokenSignature()).originToken?.identityToken;
                    }
                    if (token) {
                        send({ type: 'auth', action: 'update', payload: { token } });
                    }
                }
            }
            // If reconnecting, useCloudTokenRefresh handles auth on isConnected change
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, [isAuthenticated, refreshToken]);
};

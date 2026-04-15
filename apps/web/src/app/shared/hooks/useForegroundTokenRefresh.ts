import { useEffect, useRef } from 'react';
import { cloudCore, useWebCoreStore, webCore } from '@chatic/web-core';
import { getSocketSend, checkSocketHealth, useWebSocketV2Store } from '@chatic/socket';

const DEBOUNCE_MS = 300;

export const useForegroundTokenRefresh = (refreshToken: () => Promise<boolean>) => {
    const { isAuthenticated } = useWebCoreStore();
    const lastHiddenAt = useRef<number>(0);
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                lastHiddenAt.current = Date.now();
                return;
            }
            if (document.visibilityState !== 'visible') return;
            if (!isAuthenticated) return;

            // Debounce rapid visibility toggles
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            debounceTimer.current = setTimeout(() => {
                void handleForegroundResume();
            }, DEBOUNCE_MS);
        };

        const handleForegroundResume = async () => {
            const hiddenDuration = Date.now() - lastHiddenAt.current;
            console.log(`[ForegroundRefresh] Resumed after ${Math.round(hiddenDuration / 1000)}s`);

            // 0. Check socket health and wait for result
            const socketStatus = await checkSocketHealth();

            // 1. webCore token refresh
            await refreshToken();

            // 2. Cloud token refresh (only when delegation token exists)
            if (cloudCore.getSelectedCloudId() && cloudCore.getDelegationToken()) {
                try {
                    await cloudCore.refreshToken();
                } catch (e) {
                    console.error('[ForegroundRefresh] Cloud token refresh failed', e);
                }
            }

            // 3. Re-send auth only if socket was alive (not reconnecting)
            // If reconnecting, useCloudTokenRefresh handles auth on isConnected change
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
                        console.log('[ForegroundRefresh] Re-sending auth token');
                        send({ type: 'auth', action: 'update', payload: { token } });
                    }
                }
            } else {
                console.log('[ForegroundRefresh] Socket reconnecting — auth will be handled on reconnect');
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, [isAuthenticated, refreshToken]);
};

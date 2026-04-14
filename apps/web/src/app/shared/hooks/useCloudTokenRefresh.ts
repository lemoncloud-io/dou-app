import { useEffect } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import { cloudCore, useServiceStatusStore, useWebCoreStore, webCore } from '@chatic/web-core';

const REFRESH_INTERVAL_MS = 60_000;

const isServerError = (error: unknown): boolean => {
    const status = (error as any)?.status || (error as any)?.response?.status || (error as any)?.statusCode;
    return status >= 500 && status < 600;
};

export const useCloudTokenRefresh = () => {
    const { isAuthenticated } = useWebCoreStore();
    const { emit, isConnected } = useWebSocketV2();
    const { setServiceUnavailable } = useServiceStatusStore();
    const wssType = useWebSocketV2Store(s => s.wssType);

    useEffect(() => {
        if (!isConnected || !isAuthenticated) {
            console.log(`[CloudTokenRefresh] Skip: isConnected=${isConnected}, isAuthenticated=${isAuthenticated}`);
            return;
        }

        console.log(`[CloudTokenRefresh] Starting refresh cycle (wssType=${wssType})`);

        const refresh = async () => {
            if (wssType !== 'cloud') {
                console.log('[CloudTokenRefresh] Relay mode - getting webCore token');
                const token = (await webCore.getTokenSignature()).originToken?.identityToken;
                if (token) {
                    console.log('[CloudTokenRefresh] Sending relay auth token');
                    emit({ type: 'auth', action: 'update', payload: { token } });
                } else {
                    console.warn('[CloudTokenRefresh] No relay token available');
                }
                return;
            }

            try {
                console.log('[CloudTokenRefresh] Cloud mode - refreshing cloud token');
                await cloudCore.refreshToken();
                setServiceUnavailable(false);
            } catch (e) {
                console.error('[CloudTokenRefresh] refreshToken failed', e);
                if (isServerError(e)) {
                    setServiceUnavailable(true);
                    return;
                }
            }

            const token = cloudCore.getIdentityToken();
            if (token) {
                console.log('[CloudTokenRefresh] Sending cloud auth token');
                emit({ type: 'auth', action: 'update', payload: { token } });
            } else {
                console.warn('[CloudTokenRefresh] No cloud token available');
            }
        };

        void refresh();

        const id = setInterval(refresh, REFRESH_INTERVAL_MS);
        return () => clearInterval(id);
    }, [wssType, isAuthenticated, isConnected, emit, setServiceUnavailable]);
};

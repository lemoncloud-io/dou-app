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
        if (!isConnected || !isAuthenticated) return;

        const refresh = async () => {
            if (wssType !== 'cloud') {
                const token = (await webCore.getTokenSignature()).originToken?.identityToken;
                if (token) emit({ type: 'auth', action: 'update', payload: { token } });
                return;
            }

            try {
                await cloudCore.refreshToken();
                setServiceUnavailable(false);
            } catch (e) {
                console.error('[useCloudTokenRefresh] refreshToken failed', e);
                if (isServerError(e)) {
                    setServiceUnavailable(true);
                    return;
                }
            }

            const token = cloudCore.getIdentityToken();
            if (token) emit({ type: 'auth', action: 'update', payload: { token } });
        };

        void refresh();

        const id = setInterval(refresh, REFRESH_INTERVAL_MS);
        return () => clearInterval(id);
    }, [wssType, isAuthenticated, isConnected, emit, setServiceUnavailable]);
};

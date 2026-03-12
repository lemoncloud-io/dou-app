import { useEffect } from 'react';

import { useWebSocketV2 } from '@chatic/socket';
import { cloudCore, useWebCoreStore, webCore } from '@chatic/web-core';

const REFRESH_INTERVAL_MS = 60_000;

export const useCloudTokenRefresh = () => {
    const { isGuest, isAuthenticated } = useWebCoreStore();
    const { emit, isConnected } = useWebSocketV2();

    useEffect(() => {
        if (!isAuthenticated || !isConnected) return;

        const sendAuth = async () => {
            const token = isGuest
                ? (await webCore.getTokenSignature()).originToken?.identityToken
                : cloudCore.getIdentityToken();
            if (!token) return;
            emit({ type: 'auth', action: 'update', payload: { token } });
        };

        void sendAuth();

        if (isGuest) return;

        const refresh = async () => {
            try {
                await cloudCore.refreshToken();
                const token = cloudCore.getIdentityToken();
                if (token && isConnected) {
                    emit({ type: 'auth', action: 'update', payload: { token } });
                }
            } catch (e) {
                console.error('[useCloudTokenRefresh] failed', e);
            }
        };

        const id = setInterval(refresh, REFRESH_INTERVAL_MS);
        return () => clearInterval(id);
    }, [isGuest, isAuthenticated, isConnected, emit]);
};

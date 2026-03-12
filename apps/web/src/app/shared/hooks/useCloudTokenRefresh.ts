import { useEffect } from 'react';

import { useWebSocketV2 } from '@chatic/socket';
import { cloudCore, useWebCoreStore, webCore } from '@chatic/web-core';

const REFRESH_INTERVAL_MS = 60_000;

export const useCloudTokenRefresh = () => {
    const { isGuest, isAuthenticated } = useWebCoreStore();
    const { emit, isConnected } = useWebSocketV2();

    useEffect(() => {
        if (!isConnected || (!isGuest && !isAuthenticated)) return;

        const refresh = async () => {
            if (isGuest) {
                const token = (await webCore.getTokenSignature()).originToken?.identityToken;
                if (token) emit({ type: 'auth', action: 'update', payload: { token } });
                return;
            }

            try {
                await cloudCore.refreshToken();
            } catch (e) {
                console.error('[useCloudTokenRefresh] refreshToken failed', e);
            }

            const token = cloudCore.getIdentityToken();
            if (token) emit({ type: 'auth', action: 'update', payload: { token } });
        };

        void refresh();

        if (isGuest) return;

        const id = setInterval(refresh, REFRESH_INTERVAL_MS);
        return () => clearInterval(id);
    }, [isGuest, isAuthenticated, isConnected, emit]);
};

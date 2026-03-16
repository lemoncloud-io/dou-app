import { useEffect } from 'react';

import { useWebSocketV2 } from '@chatic/socket';
import { cloudCore, useWebCoreStore, webCore } from '@chatic/web-core';

const REFRESH_INTERVAL_MS = 60_000;

export const useCloudTokenRefresh = () => {
    const { isGuest, isInvited, isAuthenticated } = useWebCoreStore();
    const { emit, isConnected } = useWebSocketV2();

    useEffect(() => {
        if (!isConnected || !isAuthenticated) return;

        const isCloudUser = !isGuest || isInvited;

        const refresh = async () => {
            if (!isCloudUser) {
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

        const id = setInterval(refresh, REFRESH_INTERVAL_MS);
        return () => clearInterval(id);
    }, [isGuest, isInvited, isAuthenticated, isConnected, emit]);
};

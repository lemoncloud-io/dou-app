import { useEffect } from 'react';

import { useWebSocketV2 } from '@chatic/socket';
import { cloudCore, useServiceStatusStore, useWebCoreStore, webCore } from '@chatic/web-core';

const REFRESH_INTERVAL_MS = 60_000;

const isServerError = (error: unknown): boolean => {
    const status = (error as any)?.status || (error as any)?.response?.status || (error as any)?.statusCode;
    return status >= 500 && status < 600;
};

export const useCloudTokenRefresh = () => {
    const { isGuest, isInvited, isAuthenticated } = useWebCoreStore();
    const { emit, isConnected } = useWebSocketV2();
    const { setServiceUnavailable } = useServiceStatusStore();

    const isCloudUser = !isGuest || isInvited;

    const emitAuthToken = async () => {
        if (!isCloudUser) {
            const token = (await webCore.getTokenSignature()).originToken?.identityToken;
            if (token) {
                console.log('[useCloudTokenRefresh] 📡 emitting webCore auth token to socket');
                emit({ type: 'auth', action: 'update', payload: { token } });
            }
            return;
        }

        const token = cloudCore.getIdentityToken();
        if (token) {
            console.log('[useCloudTokenRefresh] 📡 emitting cloud auth token to socket');
            emit({ type: 'auth', action: 'update', payload: { token } });
        } else {
            console.warn('[useCloudTokenRefresh] ⚠️ no cloud identity token to emit');
        }
    };

    // 1. HTTP token refresh + emit (independent of socket)
    useEffect(() => {
        if (!isAuthenticated) return;

        const refreshAndEmit = async () => {
            if (isCloudUser) {
                try {
                    console.log('[useCloudTokenRefresh] 🔄 refreshing cloud token...');
                    await cloudCore.refreshToken();
                    setServiceUnavailable(false);
                    console.log('[useCloudTokenRefresh] ✅ cloud token refreshed');
                } catch (e) {
                    console.error('[useCloudTokenRefresh] ❌ refreshToken failed', e);
                    if (isServerError(e)) {
                        setServiceUnavailable(true);
                        return;
                    }
                }
            }

            await emitAuthToken();
        };

        void refreshAndEmit();

        const id = setInterval(refreshAndEmit, REFRESH_INTERVAL_MS);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                console.log('[useCloudTokenRefresh] 👁️ foreground resume → refresh + emit');
                void refreshAndEmit();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(id);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isAuthenticated, isCloudUser, setServiceUnavailable]);

    // 2. Emit auth token when socket (re)connects
    useEffect(() => {
        if (!isAuthenticated || !isConnected) return;
        console.log('[useCloudTokenRefresh] 🔌 socket connected → emitting auth token');
        void emitAuthToken();
    }, [isAuthenticated, isConnected]);
};

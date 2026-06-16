import { useEffect, useRef } from 'react';
import { logger } from '@chatic/bridges';
import { cloudCore, useWebCoreStore, webCore } from '@chatic/web-core';
import { getSocketManager, useSocketState } from '../socket';
import { useRepositories } from '../data';

const DEBOUNCE_MS = 300;

export const useForegroundTokenRefresh = (refreshToken: () => Promise<boolean>) => {
    const { isAuthenticated } = useWebCoreStore();
    const wssType = useSocketState(state => state.wssType);
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { auth: authRepository } = useRepositories();

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
            const client = getSocketManager().getActiveClient();
            // Socket health check and token refresh are independent — run in parallel
            const [socketStatus] = await Promise.all([
                Promise.resolve(client?.state === 'connected' ? ('connected' as const) : ('reconnecting' as const)),
                refreshToken().catch(() => false),
            ]);

            // Cloud token refresh (only when delegation token exists)
            if (cloudCore.getSelectedCloudId() && cloudCore.getDelegationToken()) {
                try {
                    await cloudCore.refreshToken();
                } catch (e) {
                    logger.error('AUTH', '[ForegroundRefresh] Cloud token refresh failed', { error: e });
                }
            }

            // Re-send auth only if socket was alive (not reconnecting)
            if (socketStatus === 'connected') {
                let token: string | undefined;
                if (wssType === 'cloud') {
                    token = cloudCore.getIdentityToken();
                } else {
                    token = (await webCore.getTokenSignature()).originToken?.identityToken;
                }
                if (client && token) {
                    await authRepository.updateSocketAuth({ token });
                }
            }
            // If reconnecting, useCloudTokenRefresh handles auth on isConnected change
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, [isAuthenticated, refreshToken, wssType, authRepository]);
};

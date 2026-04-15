import { useEffect, useRef } from 'react';
import { cloudCore, useWebCoreStore, webCore } from '@chatic/web-core';
import { useWebSocketV2Store, getSocketSend, checkSocketHealth } from '@chatic/socket';

export const useForegroundTokenRefresh = (refreshToken: () => Promise<boolean>) => {
    const { isAuthenticated } = useWebCoreStore();
    const lastHiddenAt = useRef<number>(0);

    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'hidden') {
                lastHiddenAt.current = Date.now();
                return;
            }

            if (document.visibilityState !== 'visible') return;
            if (!isAuthenticated) return;

            const hiddenDuration = Date.now() - lastHiddenAt.current;
            console.log(`[ForegroundRefresh] Resumed after ${Math.round(hiddenDuration / 1000)}s`);

            // 0. Worker에 소켓 상태 체크 요청 (죽었으면 자동 reconnect)
            checkSocketHealth();

            // 1. webCore 토큰 리프레시
            await refreshToken();

            // 2. cloud 토큰 리프레시 (delegation token이 있을 때만)
            if (cloudCore.getSelectedCloudId() && cloudCore.getDelegationToken()) {
                try {
                    await cloudCore.refreshToken();
                } catch (e) {
                    console.error('[ForegroundRefresh] Cloud token refresh failed', e);
                }
            }

            // 3. WebSocket 상태 확인 및 auth 재전송
            const { isConnected, wssType } = useWebSocketV2Store.getState();
            if (isConnected) {
                // 소켓이 연결되어 있으면 auth 이벤트 재전송
                const send = getSocketSend();
                if (send) {
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
            }
            // 소켓이 끊겨있으면 Worker의 자동 reconnect가 처리하고,
            // reconnect 후 useCloudTokenRefresh에서 isConnected 변경 감지 → auth 재전송
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [isAuthenticated, refreshToken]);
};

import { useEffect, useRef } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import { cloudCore, reportError, toError, useServiceStatusStore, useWebCoreStore, webCore } from '@chatic/web-core';

const REFRESH_INTERVAL_MS = 60_000;

const isServerError = (error: unknown): boolean => {
    const err = error as any;
    const status = err?.status || err?.response?.status || err?.statusCode;
    return status >= 500 && status < 600;
};

export const useCloudTokenRefresh = () => {
    const { isAuthenticated } = useWebCoreStore();
    const { emit, isConnected } = useWebSocketV2();
    const { setServiceUnavailable } = useServiceStatusStore();
    const wssType = useWebSocketV2Store(s => s.wssType);
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const refreshingRef = useRef(false);

    useEffect(() => {
        if (!isConnected || !isAuthenticated) return;

        const refresh = async () => {
            if (refreshingRef.current) return;
            refreshingRef.current = true;
            try {
                if (wssType !== 'cloud') {
                    const token = (await webCore.getTokenSignature()).originToken?.identityToken;
                    if (token) emit({ type: 'auth', action: 'update', payload: { token } });
                    return;
                }

                try {
                    await cloudCore.refreshToken();
                    setServiceUnavailable(false);
                } catch (e) {
                    console.error('[CloudTokenRefresh] refreshToken failed', e);
                    reportError(toError(e));
                    if (isServerError(e)) {
                        setServiceUnavailable(true);
                        return;
                    }
                }

                const token = cloudCore.getIdentityToken();
                if (token) emit({ type: 'auth', action: 'update', payload: { token } });
            } finally {
                refreshingRef.current = false;
            }
        };

        if (!isVerified) {
            // 미인증 상태: caller(selectCloud/handleSelectPlace)가 이미 토큰을 준비했으므로
            // refreshToken을 다시 호출하지 않고 기존 토큰만 전송
            // (refreshToken()을 호출하면 place 전용 토큰이 cloud 레벨 토큰으로 덮어써짐)
            // NOTE: effect deps(isConnected, isVerified 등) 변경으로 여러 번 실행될 수 있으나
            // 같은 토큰의 중복 auth:update는 서버에서 무해하게 처리됨
            const token = wssType !== 'cloud' ? null : cloudCore.getIdentityToken();
            if (wssType !== 'cloud') {
                void (async () => {
                    const t = (await webCore.getTokenSignature()).originToken?.identityToken;
                    if (t) emit({ type: 'auth', action: 'update', payload: { token: t } });
                })();
            } else if (token) {
                emit({ type: 'auth', action: 'update', payload: { token } });
            }
            return;
        }

        // 주기적 토큰 갱신 (인증 완료 상태에서만)
        const id = setInterval(() => {
            void refresh();
        }, REFRESH_INTERVAL_MS);

        return () => clearInterval(id);
    }, [wssType, isAuthenticated, isConnected, isVerified, emit, setServiceUnavailable]);
};

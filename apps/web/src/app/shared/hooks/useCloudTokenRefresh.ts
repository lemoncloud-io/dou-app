import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/app-messages';
import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import { cloudCore, reportError, toError, useServiceStatusStore, useWebCoreStore, webCore } from '@chatic/web-core';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

const REFRESH_INTERVAL_MS = 60_000;
const AUTH_UPDATE_MAX_RETRIES = 3;
const AUTH_UPDATE_BASE_DELAY_MS = 2_000;

const isServerError = (error: unknown): boolean => {
    const err = error as any;
    const status = err?.status || err?.response?.status || err?.statusCode;
    return status >= 500 && status < 600;
};

export const useCloudTokenRefresh = () => {
    const { t } = useTranslation();
    const { isAuthenticated } = useWebCoreStore();
    const { emit, isConnected } = useWebSocketV2();
    const { setServiceUnavailable } = useServiceStatusStore();
    const { toast } = useToast();
    const wssType = useWebSocketV2Store(s => s.wssType);
    const isDeviceRegistered = useWebSocketV2Store(s => s.isDeviceRegistered);
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const refreshingRef = useRef(false);

    useEffect(() => {
        // Wait for device.save response before sending auth.update
        if (!isConnected || !isAuthenticated || !isDeviceRegistered) return;

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
                    logger.error('AUTH', '[CloudTokenRefresh] refreshToken failed', { error: e });
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
            // 실패 시 exponential backoff로 재시도 (최대 AUTH_UPDATE_MAX_RETRIES회)
            const sendAuthUpdate = async () => {
                if (wssType !== 'cloud') {
                    const sig = (await webCore.getTokenSignature()).originToken?.identityToken;
                    if (sig) emit({ type: 'auth', action: 'update', payload: { token: sig } });
                } else {
                    const token = cloudCore.getIdentityToken();
                    if (token) emit({ type: 'auth', action: 'update', payload: { token } });
                }
            };

            let retryCount = 0;
            let retryTimer: ReturnType<typeof setTimeout>;

            const attemptAuthUpdate = () => {
                // 이미 인증 완료되었으면 재시도 중단
                if (useWebSocketV2Store.getState().isVerified) return;

                void sendAuthUpdate();
                retryCount++;

                if (retryCount > AUTH_UPDATE_MAX_RETRIES) {
                    logger.error('AUTH', '[CloudTokenRefresh] auth:update failed after max retries', {
                        data: { retries: AUTH_UPDATE_MAX_RETRIES },
                    });
                    toast({ title: t('inviteAccept.authVerifyFailed'), variant: 'destructive' });
                    return;
                }

                const delay = AUTH_UPDATE_BASE_DELAY_MS * Math.pow(2, retryCount - 1);
                logger.warn('AUTH', '[CloudTokenRefresh] auth:update retry scheduled', {
                    attempt: retryCount,
                    maxAttempts: AUTH_UPDATE_MAX_RETRIES,
                    delay,
                });
                retryTimer = setTimeout(() => {
                    // 재확인: 이미 인증 완료되었으면 재시도 중단
                    if (useWebSocketV2Store.getState().isVerified) return;
                    attemptAuthUpdate();
                }, delay);
            };

            attemptAuthUpdate();

            return () => clearTimeout(retryTimer);
        }

        // 주기적 토큰 갱신 (인증 완료 상태에서만)
        const id = setInterval(() => {
            void refresh();
        }, REFRESH_INTERVAL_MS);

        return () => clearInterval(id);
    }, [wssType, isAuthenticated, isConnected, isDeviceRegistered, isVerified, emit, setServiceUnavailable, toast, t]);
};

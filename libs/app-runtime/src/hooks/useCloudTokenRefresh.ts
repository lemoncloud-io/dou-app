import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { cloudCore, reportError, toError, useServiceStatusStore, useWebCoreStore, webCore } from '@chatic/web-core';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useRepositories } from '../data';

const REFRESH_INTERVAL_MS = 60_000;
const AUTH_UPDATE_MAX_RETRIES = 3;
const AUTH_UPDATE_BASE_DELAY_MS = 2_000;

// caller(handleSelectPlace)가 토큰 갱신 중일 때 자동 auth:update 전송을 차단
// handleSelectPlace: refreshToken(async) → auth.update
// 이 플래그가 없으면 refreshToken 완료 전에 useCloudTokenRefresh가 OLD 토큰으로 auth를 보냄
let _skipAutoAuth = false;
export const setSkipAutoAuth = (value: boolean) => {
    _skipAutoAuth = value;
};

const isServerError = (error: unknown): boolean => {
    const err = error as any;
    const status = err?.status || err?.response?.status || err?.statusCode;
    return status >= 500 && status < 600;
};

const isAuthError = (error: unknown): boolean => {
    const err = error as any;
    const status = err?.status || err?.response?.status || err?.statusCode;
    const message = String(err?.message || err?.data?.message || '');
    return (
        (typeof status === 'number' && status >= 400 && status < 500) ||
        message.includes('INVALID_TOKEN') ||
        message.includes('Token validation failed') ||
        message.includes('signature timeout')
    );
};

export const useCloudTokenRefresh = () => {
    const { t } = useTranslation();
    const { isAuthenticated } = useWebCoreStore();
    const { auth: authRepository } = useRepositories();
    const isConnected = useWebSocketV2Store(s => s.isConnected);
    const { setServiceUnavailable } = useServiceStatusStore();
    const { toast } = useToast();
    const wssType = useWebSocketV2Store(s => s.wssType);
    const isDeviceRegistered = useWebSocketV2Store(s => s.isDeviceRegistered);
    const refreshingRef = useRef(false);

    useEffect(() => {
        // Wait for device.save response before sending auth.update
        if (!isConnected || !isAuthenticated || !isDeviceRegistered) return;

        let disposed = false;
        let retryCount = 0;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let refreshInterval: ReturnType<typeof setInterval> | null = null;

        const sendAuthUpdate = async () => {
            const token =
                wssType !== 'cloud'
                    ? (await webCore.getTokenSignature()).originToken?.identityToken
                    : cloudCore.getIdentityToken();

            if (!token) return;
            await authRepository.updateSocketAuth({ token });
        };

        const refresh = async () => {
            if (disposed || refreshingRef.current) return;
            refreshingRef.current = true;
            try {
                if (wssType === 'cloud') {
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
                        if (isAuthError(e)) {
                            // cloud 토큰 만료/무효 → 기본 클라우드(relay)로 fallback
                            logger.warn(
                                'AUTH',
                                '[CloudTokenRefresh] Cloud token expired, falling back to default cloud'
                            );
                            cloudCore.clearDelegationToken();
                            cloudCore.clearSelectedPlace();
                            cloudCore.saveSelectedCloudId('default');
                            useWebCoreStore.getState().setSelectedCloudId('default');
                            useWebCoreStore.getState().setSelectedPlaceId(null);
                            toast({ title: t('cloudSessionSheet.cloudSessionExpired'), variant: 'destructive' });
                            return;
                        }
                    }
                }

                await sendAuthUpdate();
            } catch (error) {
                logger.error('AUTH', '[CloudTokenRefresh] auth:update failed', { error });
            } finally {
                refreshingRef.current = false;
            }
        };

        const startRefreshInterval = () => {
            if (refreshInterval) return;
            refreshInterval = setInterval(() => {
                void refresh();
            }, REFRESH_INTERVAL_MS);
        };

        const attemptInitialAuthUpdate = async () => {
            if (disposed) return;

            if (_skipAutoAuth) {
                retryTimer = setTimeout(() => {
                    void attemptInitialAuthUpdate();
                }, AUTH_UPDATE_BASE_DELAY_MS);
                return;
            }

            try {
                await sendAuthUpdate();
                startRefreshInterval();
            } catch (error) {
                retryCount++;

                if (retryCount > AUTH_UPDATE_MAX_RETRIES) {
                    logger.error('AUTH', '[CloudTokenRefresh] auth:update failed after max retries', {
                        error,
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
                    void attemptInitialAuthUpdate();
                }, delay);
            }
        };

        void attemptInitialAuthUpdate();

        return () => {
            disposed = true;
            if (retryTimer) clearTimeout(retryTimer);
            if (refreshInterval) clearInterval(refreshInterval);
        };
    }, [authRepository, wssType, isAuthenticated, isConnected, isDeviceRegistered, setServiceUnavailable, toast, t]);
};

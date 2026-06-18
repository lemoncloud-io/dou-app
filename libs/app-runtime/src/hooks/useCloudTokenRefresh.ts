import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useRefreshCloudToken } from '@chatic/web-core';
import { logger } from '@chatic/bridges';
import { reportError, sessionProfileResolver, toError, useServiceStatusStore, useWebCoreStore } from '@chatic/web-core';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { getSocketAuthCoordinator, useRuntimeRepositories } from '../runtime';
import { useSocketState } from '../socket';

const REFRESH_INTERVAL_MS = 60_000;
const AUTH_UPDATE_MAX_RETRIES = 3;
const AUTH_UPDATE_BASE_DELAY_MS = 2_000;

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
    const { mutateAsync: refreshCloudToken } = useRefreshCloudToken();
    const { isAuthenticated, selectedCloudId } = useWebCoreStore();
    const { auth: authRepository } = useRuntimeRepositories();
    const isConnected = useSocketState(s => s.isConnected);
    const { setServiceUnavailable } = useServiceStatusStore();
    const { toast } = useToast();
    const wssType =
        selectedCloudId !== 'default' && sessionProfileResolver.getCloudProfile().getDelegationToken()
            ? 'cloud'
            : 'relay';
    const isDeviceRegistered = useSocketState(s => s.isDeviceRegistered);
    const refreshingRef = useRef(false);
    const coordinator = getSocketAuthCoordinator();

    useEffect(() => {
        if (!isConnected || !isAuthenticated || !isDeviceRegistered) return;

        let disposed = false;
        let retryCount = 0;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let refreshInterval: ReturnType<typeof setInterval> | null = null;

        const sendAuthUpdate = async (reason: string) => {
            if (coordinator.isTransitioning()) {
                logger.info('AUTH', '[CloudTokenRefresh] auth paused during cloud transition', { data: { reason } });
                return false;
            }

            return coordinator.reauthenticateSocket({
                authRepository,
                reason,
                wssType,
            });
        };

        const refresh = async () => {
            if (disposed || refreshingRef.current) return;
            refreshingRef.current = true;
            try {
                if (wssType === 'cloud') {
                    try {
                        await coordinator.refreshCloudTokenIfNeeded({
                            refreshCloudToken: target => refreshCloudToken({ target }),
                            reason: 'interval-refresh',
                            wssType,
                        });
                        setServiceUnavailable(false);
                    } catch (error) {
                        logger.error('AUTH', '[CloudTokenRefresh] refreshToken failed', { error });
                        reportError(toError(error));
                        if (isServerError(error)) {
                            setServiceUnavailable(true);
                            return;
                        }
                        if (isAuthError(error)) {
                            const cloudProfile = sessionProfileResolver.getCloudProfile();
                            logger.warn(
                                'AUTH',
                                '[CloudTokenRefresh] Cloud token expired, falling back to default cloud'
                            );
                            cloudProfile.clearDelegationToken();
                            cloudProfile.clearSelectedSite();
                            useWebCoreStore.getState().setSelectedCloudId('default');
                            useWebCoreStore.getState().setSelectedSiteId(null);
                            toast({ title: t('cloudSessionSheet.cloudSessionExpired'), variant: 'destructive' });
                            return;
                        }
                    }
                }

                await sendAuthUpdate('interval-auth-update');
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

            if (coordinator.isTransitioning()) {
                retryTimer = setTimeout(() => {
                    void attemptInitialAuthUpdate();
                }, AUTH_UPDATE_BASE_DELAY_MS);
                return;
            }

            try {
                const sent = await sendAuthUpdate('socket-bootstrap');
                if (!sent) return;
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
    }, [
        authRepository,
        coordinator,
        isAuthenticated,
        isConnected,
        isDeviceRegistered,
        refreshCloudToken,
        setServiceUnavailable,
        t,
        toast,
        wssType,
    ]);
};

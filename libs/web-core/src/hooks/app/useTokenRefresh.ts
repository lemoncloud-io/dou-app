import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/bridges';

import { reportError } from '../../api';
import type { ErrorClassification } from '../../transport/error';
import { classifyError, toError } from '../../transport/error';
import { loadRelayProfile, refreshActiveCloudSession, refreshRelaySession, tryLoadRelayProfile } from '../../session';
import { useSessionLogout } from '../session';
import { useSessionAuth } from '../session/readers/useSessionAuth';
import { useSessionIdentity } from '../session/readers/useSessionIdentity';

type InitializationStatus = 'pending' | 'success' | 'failed';

const REFRESH_INTERVAL = 1000 * 60;
const MIN_REFRESH_GAP = 5000;
const MAX_NETWORK_RETRIES = 3;
const NETWORK_RETRY_BASE_MS = 2000;

const isInviteFlow = (): boolean => {
    const params = new URLSearchParams(window.location.search);
    return params.get('provider') === 'invite';
};

/**
 * Maintains relay token validity for an initialized app runtime and recovers profile state when possible.
 */
export const useTokenRefresh = (webCoreReady: boolean) => {
    const { isAuthenticated } = useSessionAuth();
    const { relayProfile, isInvited } = useSessionIdentity();
    const logout = useSessionLogout();

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isRefreshingRef = useRef(false);
    const lastRefreshTime = useRef(0);
    const isInitializedRef = useRef(false);
    const hasFailedRef = useRef(false);
    const networkRetryRef = useRef(0);
    const [initStatus, setInitStatus] = useState<InitializationStatus>('pending');
    const wasInviteFlowRef = useRef(isInviteFlow());

    const refreshToken = useCallback(async (): Promise<boolean> => {
        const now = Date.now();
        const isDuplicated = now - lastRefreshTime.current < MIN_REFRESH_GAP || isRefreshingRef.current;
        if (isDuplicated) {
            return true;
        }

        isRefreshingRef.current = true;
        lastRefreshTime.current = now;

        // Cloud refresh runs in parallel with relay. It is cloudToken-based and, even on failure,
        // never triggers logout — relay stays the continuity baseline (independent failure).
        void refreshActiveCloudSession().catch(error =>
            logger.error('AUTH', '[tokenRefresh] cloud refresh failed (keeping relay)', { error })
        );

        try {
            await refreshRelaySession({ syncProfile: false });
            return true;
        } catch (error) {
            logger.error('AUTH', 'Token refresh failed', { error });
            reportError(toError(error));
            const errorClassification: ErrorClassification = classifyError(error);
            if (errorClassification.shouldLogout) {
                if (isInvited) {
                    logger.warn(
                        'AUTH',
                        'Token expired in invite session, skipping auto-logout to preserve cloud state'
                    );
                    return false;
                }
                logger.info('AUTH', 'Token completely expired or invalid - logging out');
                await logout(wasInviteFlowRef.current ? { preserveUrl: true } : undefined);
                return false;
            }
            logger.info('AUTH', 'Temporary refresh failure, will retry later');
            return true;
        } finally {
            isRefreshingRef.current = false;
        }
    }, [isInvited, logout]);

    const startInterval = useCallback(() => {
        if (intervalRef.current) {
            return;
        }

        logger.info('AUTH', 'Starting token refresh interval', { interval: REFRESH_INTERVAL });
        intervalRef.current = setInterval(refreshToken, REFRESH_INTERVAL);
    }, [refreshToken]);

    const stopInterval = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            logger.info('AUTH', 'Stopped token refresh interval');
        }
    }, []);

    const initialize = useCallback(async () => {
        if (!isAuthenticated || !webCoreReady || isInitializedRef.current || hasFailedRef.current) {
            logger.info('AUTH', '[tokenRefresh] initialize skipped', {
                data: {
                    isAuthenticated,
                    webCoreReady,
                    isInitialized: isInitializedRef.current,
                    hasFailed: hasFailedRef.current,
                },
            });
            return;
        }

        logger.info('AUTH', '[tokenRefresh] Initializing: checking token validity');
        try {
            const hasCachedProfile = !!relayProfile;
            const [refreshSuccess, optimisticProfile] = await Promise.all([refreshToken(), tryLoadRelayProfile()]);

            if (!refreshSuccess) {
                logger.warn('AUTH', '[tokenRefresh] token refresh failed, marking as failed');
                hasFailedRef.current = true;
                setInitStatus('failed');
                return;
            }

            if (optimisticProfile) {
                logger.info('AUTH', '[tokenRefresh] parallel init succeeded');
                isInitializedRef.current = true;
                networkRetryRef.current = 0;
                setInitStatus('success');
                return;
            }

            if (hasCachedProfile) {
                logger.info('AUTH', '[tokenRefresh] using cached profile, background refresh');
                isInitializedRef.current = true;
                networkRetryRef.current = 0;
                setInitStatus('success');
                loadRelayProfile().catch(e =>
                    logger.warn('AUTH', '[tokenRefresh] bg profile refresh failed', { error: e })
                );
                return;
            }

            logger.info('AUTH', '[tokenRefresh] token refreshed, fetching profile');
            await loadRelayProfile();

            isInitializedRef.current = true;
            networkRetryRef.current = 0;
            setInitStatus('success');
        } catch (error: unknown) {
            logger.error('PROFILE', 'Profile fetch failed', { error });
            reportError(toError(error));

            const errorClassification: ErrorClassification = classifyError(error);

            if (errorClassification.shouldLogout) {
                logger.info('AUTH', 'Profile fetch got auth error, refreshing token once more');
                const refreshSuccess = await refreshToken();
                if (refreshSuccess) {
                    try {
                        await loadRelayProfile();
                        isInitializedRef.current = true;
                        setInitStatus('success');
                        logger.info('AUTH', 'Initialization succeeded after additional token refresh');
                        return;
                    } catch (retryError) {
                        logger.error('PROFILE', 'Profile fetch failed even after token refresh', { error: retryError });
                        const retryErrorClassification: ErrorClassification = classifyError(retryError);
                        if (retryErrorClassification.shouldLogout) {
                            hasFailedRef.current = true;
                            setInitStatus('failed');
                            if (isInvited) {
                                logger.warn('AUTH', 'Profile fetch failing in invite session, skipping auto-logout');
                                return;
                            }
                            logger.info('AUTH', 'Profile fetch still failing with auth error - logging out');
                            await logout(wasInviteFlowRef.current ? { preserveUrl: true } : undefined);
                            return;
                        }
                    }
                }
            }

            if (networkRetryRef.current < MAX_NETWORK_RETRIES) {
                networkRetryRef.current++;
                const delay = NETWORK_RETRY_BASE_MS * networkRetryRef.current;
                logger.info('AUTH', 'Network error, retrying initialization', {
                    delay,
                    retryCount: networkRetryRef.current,
                    maxRetries: MAX_NETWORK_RETRIES,
                });
                await new Promise(resolve => setTimeout(resolve, delay));
                hasFailedRef.current = false;
                await initialize();
                return;
            }

            hasFailedRef.current = true;
            setInitStatus('failed');
            logger.info('AUTH', 'Initialization failed after all network retries');
        }
    }, [isAuthenticated, isInvited, logout, refreshToken, relayProfile, webCoreReady]);

    useEffect(() => {
        if (isAuthenticated && webCoreReady) {
            initialize().then(() => {
                if (isInitializedRef.current) {
                    startInterval();
                }
            });
        } else {
            stopInterval();
            isInitializedRef.current = false;
            hasFailedRef.current = false;
            networkRetryRef.current = 0;
            setInitStatus('pending');
        }

        return stopInterval;
    }, [isAuthenticated, initialize, startInterval, stopInterval, webCoreReady]);

    useEffect(() => {
        if (initStatus !== 'failed' || !isAuthenticated || !webCoreReady) return;

        const handleVisibility = () => {
            if (document.visibilityState !== 'visible') return;
            logger.info('AUTH', 'App resumed with failed init state, retrying');
            hasFailedRef.current = false;
            networkRetryRef.current = 0;
            setInitStatus('pending');
            initialize().then(() => {
                if (isInitializedRef.current) {
                    startInterval();
                }
            });
        };

        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [initStatus, isAuthenticated, webCoreReady, initialize, startInterval]);

    const isInitialized = initStatus === 'success' || initStatus === 'failed';

    return {
        refreshToken,
        isRefreshing: isRefreshingRef.current,
        isInitialized,
        initStatus,
    };
};

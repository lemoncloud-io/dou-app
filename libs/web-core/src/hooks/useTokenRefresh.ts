import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/app-messages';

import { fetchProfile, refreshAuthToken, reportError } from '../api';
import { useWebCoreStore } from '../stores';
import type { ErrorClassification } from '../utils';
import { classifyError, toError } from '../utils';

type InitializationStatus = 'pending' | 'success' | 'failed';

const REFRESH_INTERVAL = 1000 * 60; // 1분
const MIN_REFRESH_GAP = 5000; // 5초 간격 제한
const MAX_NETWORK_RETRIES = 3;
const NETWORK_RETRY_BASE_MS = 2000;

const isInviteFlow = (): boolean => {
    const params = new URLSearchParams(window.location.search);
    return params.get('provider') === 'invite';
};

export const useTokenRefresh = (webCoreReady: boolean) => {
    const { isAuthenticated, setProfile, logout } = useWebCoreStore();

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isRefreshingRef = useRef(false);
    const lastRefreshTime = useRef(0);
    const isInitializedRef = useRef(false);
    const hasFailedRef = useRef(false);
    const networkRetryRef = useRef(0);
    const [initStatus, setInitStatus] = useState<InitializationStatus>('pending');
    // Capture invite flow state at mount time to avoid stale URL reads during interval refresh
    const wasInviteFlowRef = useRef(isInviteFlow());

    const refreshToken = useCallback(async (): Promise<boolean> => {
        const now = Date.now();
        const isDuplicated = now - lastRefreshTime.current < MIN_REFRESH_GAP || isRefreshingRef.current;
        if (isDuplicated) {
            return true;
        }

        isRefreshingRef.current = true;
        lastRefreshTime.current = now;

        try {
            await refreshAuthToken();
            return true;
        } catch (error) {
            logger.error('AUTH', 'Token refresh failed', { error });
            reportError(toError(error));
            const errorClassification: ErrorClassification = classifyError(error);
            if (errorClassification.shouldLogout) {
                // Invite 세션에서는 auto-logout 방지 — cloud 토큰/상태 보존
                // initStatus='failed' fallback으로 앱을 렌더하여 사용자가 수동 조치 가능
                const { isInvited } = useWebCoreStore.getState();
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
    }, [logout]);

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
        // Prevent re-initialization if already initialized or failed
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
            const refreshSuccess = await refreshToken();
            if (!refreshSuccess) {
                logger.warn('AUTH', '[tokenRefresh] token refresh failed, marking as failed');
                hasFailedRef.current = true;
                setInitStatus('failed');
                return;
            }
            logger.info('AUTH', '[tokenRefresh] token refreshed, fetching profile');

            const profile = await fetchProfile();
            setProfile(profile);

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
                        const profile = await fetchProfile();
                        setProfile(profile);
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
                            // Invite 세션에서는 auto-logout 방지
                            const { isInvited } = useWebCoreStore.getState();
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

            // For non-auth errors (network, server), retry with backoff before giving up
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
    }, [isAuthenticated, refreshToken, webCoreReady, setProfile, logout]);

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

    // Retry initialization on foreground if it previously failed due to network
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

    // isInitialized should be true only when initialization succeeded
    // or when initialization failed (to prevent infinite loading)
    const isInitialized = initStatus === 'success' || initStatus === 'failed';

    return {
        refreshToken,
        isRefreshing: isRefreshingRef.current,
        isInitialized,
        initStatus,
    };
};

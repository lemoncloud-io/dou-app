import { useCallback, useEffect, useRef, useState } from 'react';

import { postMessage } from '@chatic/app-messages';

import { fetchProfile, refreshAuthToken } from '../api';
import { useWebCoreStore } from '../stores';
import { classifyError } from '../utils';

import type { ErrorClassification } from '../utils';

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
    const { isAuthenticated, isOnMobileApp, setProfile, logout } = useWebCoreStore();

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
            if (isOnMobileApp) {
                // NOTE: send message to MobileApp
                postMessage({ type: 'SyncCredential' });
                return true;
            }

            await refreshAuthToken();
            return true;
        } catch (error) {
            console.error('❌ Token refresh failed:', error);
            const errorClassification: ErrorClassification = classifyError(error);
            if (errorClassification.shouldLogout) {
                console.log('🚪 Token completely expired or invalid - logging out...');
                await logout(wasInviteFlowRef.current ? { preserveUrl: true } : undefined);
                return false;
            }
            console.log('⚠️ Temporary refresh failure, will retry later');
            return true;
        } finally {
            isRefreshingRef.current = false;
        }
    }, [logout]);

    const startInterval = useCallback(() => {
        if (intervalRef.current) {
            return;
        }

        console.log(`🚀 Starting token refresh interval: ${REFRESH_INTERVAL}ms`);
        intervalRef.current = setInterval(refreshToken, REFRESH_INTERVAL);
    }, [refreshToken]);

    const stopInterval = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            console.log('🛑 Stopped token refresh interval');
        }
    }, []);

    const initialize = useCallback(async () => {
        // Prevent re-initialization if already initialized or failed
        if (!isAuthenticated || !webCoreReady || isInitializedRef.current || hasFailedRef.current) {
            return;
        }

        console.log('🏁 Initializing: checking token validity...');
        try {
            const refreshSuccess = await refreshToken();
            if (!refreshSuccess) {
                hasFailedRef.current = true;
                setInitStatus('failed');
                return;
            }

            const profile = await fetchProfile();
            setProfile(profile);

            isInitializedRef.current = true;
            networkRetryRef.current = 0;
            setInitStatus('success');
        } catch (error: unknown) {
            console.error('❌ Profile fetch failed:', error);

            const errorClassification: ErrorClassification = classifyError(error);

            if (errorClassification.shouldLogout) {
                console.log('🔄 Profile fetch got auth error, refreshing token once more...');
                const refreshSuccess = await refreshToken();
                if (refreshSuccess) {
                    try {
                        const profile = await fetchProfile();
                        setProfile(profile);
                        isInitializedRef.current = true;
                        setInitStatus('success');
                        console.log('✅ Initialization succeeded after additional token refresh');
                        return;
                    } catch (retryError) {
                        console.error('❌ Profile fetch failed even after token refresh: ', retryError);
                        const retryErrorClassification: ErrorClassification = classifyError(retryError);
                        if (retryErrorClassification.shouldLogout) {
                            console.log('🚪 Profile fetch still failing with auth error - logging out...');
                            hasFailedRef.current = true;
                            setInitStatus('failed');
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
                console.log(
                    `⚠️ Network error, retrying in ${delay}ms (${networkRetryRef.current}/${MAX_NETWORK_RETRIES})`
                );
                await new Promise(resolve => setTimeout(resolve, delay));
                hasFailedRef.current = false;
                await initialize();
                return;
            }

            hasFailedRef.current = true;
            setInitStatus('failed');
            console.log('⚠️ Initialization failed after all network retries');
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
            console.log('🔄 App resumed with failed init state, retrying...');
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

import { useCallback, useEffect, useRef, useState } from 'react';

import { postMessage } from '@chatic/app-messages';

import { fetchProfile, refreshAuthToken } from '../api';
import { useWebCoreStore } from '../stores';
import { classifyError } from '../utils';

import type { ErrorClassification } from '../utils';

type InitializationStatus = 'pending' | 'success' | 'failed';

const REFRESH_INTERVAL = 1000 * 60; // 1분
const MIN_REFRESH_GAP = 5000; // 5초 간격 제한

export const useTokenRefresh = (webCoreReady: boolean) => {
    const { isAuthenticated, isOnMobileApp, setProfile, logout } = useWebCoreStore();

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isRefreshingRef = useRef(false);
    const lastRefreshTime = useRef(0);
    const isInitializedRef = useRef(false);
    const hasFailedRef = useRef(false);
    const [initStatus, setInitStatus] = useState<InitializationStatus>('pending');

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
                await logout();
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
                            await logout();
                            return;
                        }
                    }
                }
            }

            // For non-auth errors (network, server), mark as failed but don't logout
            // This prevents infinite loop when network is temporarily unavailable
            hasFailedRef.current = true;
            setInitStatus('failed');
            console.log('⚠️ Initialization failed due to non-auth error');
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
            setInitStatus('pending');
        }

        return stopInterval;
    }, [isAuthenticated, initialize, startInterval, stopInterval, webCoreReady]);

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

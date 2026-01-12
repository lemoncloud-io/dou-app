import { useCallback, useEffect, useRef } from 'react';

import { sendWebMessage } from '@chatic/app-messages';

import { fetchProfile, refreshAuthToken } from '../api';
import { useWebCoreStore } from '../stores';
import { classifyError } from '../utils';

import type { ErrorClassification } from '../utils';

const REFRESH_INTERVAL = 1000 * 60; // 1분
const MIN_REFRESH_GAP = 5000; // 5초 간격 제한

export const useTokenRefresh = (webCoreReady: boolean) => {
    const { isAuthenticated, isOnMobileApp, setProfile, logout } = useWebCoreStore();

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isRefreshingRef = useRef(false);
    const lastRefreshTime = useRef(0);
    const isInitializedRef = useRef(false);

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
                sendWebMessage({ type: 'SyncCredential' });
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
        if (!isAuthenticated || !webCoreReady || isInitializedRef.current) {
            return;
        }

        console.log('🏁 Initializing: checking token validity...');
        try {
            const refreshSuccess = await refreshToken();
            if (!refreshSuccess) {
                return;
            }

            const profile = await fetchProfile();
            setProfile(profile);

            isInitializedRef.current = true;
        } catch (error: unknown) {
            console.error('❌ Profile fetch failed:', error);

            const errorObj = error as { status?: number; response?: { status?: number }; message?: string };
            const is403 =
                errorObj?.status === 403 ||
                errorObj?.response?.status === 403 ||
                (errorObj?.message && errorObj.message.includes('403'));

            if (is403) {
                console.log('🔄 Profile fetch got 403, refreshing token once more...');
                const refreshSuccess = await refreshToken();
                if (refreshSuccess) {
                    try {
                        const profile = await fetchProfile();
                        setProfile(profile);
                        isInitializedRef.current = true;
                        console.log('✅ Initialization succeeded after additional token refresh');
                    } catch (retryError) {
                        console.error('❌ Profile fetch failed even after token refresh: ', retryError);
                    }
                }
            }
        }
    }, [isAuthenticated, refreshToken, webCoreReady, setProfile]);

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
        }

        return stopInterval;
    }, [isAuthenticated, initialize, startInterval, stopInterval, webCoreReady]);

    return {
        refreshToken,
        isRefreshing: isRefreshingRef.current,
        isInitialized: isInitializedRef.current,
    };
};

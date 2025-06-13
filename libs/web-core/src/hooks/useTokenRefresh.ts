import { useCallback, useEffect, useRef } from 'react';

import { fetchProfile, refreshAuthToken } from '../api';
import { useWebCoreStore } from '../stores';

const REFRESH_INTERVAL = 1000 * 60; // 1분
const MIN_REFRESH_GAP = 5000; // 5초 간격 제한

export const useTokenRefresh = (webCoreReady: boolean) => {
    const { isAuthenticated, setProfile, logout } = useWebCoreStore();

    const intervalRef = useRef<number | null>(null);
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
            await refreshAuthToken();
            return true;
        } catch (error) {
            console.error('❌ Token refresh failed:', error);

            const is403 =
                error?.status === 403 ||
                error?.response?.status === 403 ||
                (error?.message && error.message.includes('403'));
            if (is403) {
                console.log('🚪 Token completely expired - logging out...');
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
        } catch (error) {
            console.error('❌ Profile fetch failed:', error);

            const is403 =
                error?.status === 403 ||
                error?.response?.status === 403 ||
                (error?.message && error.message.includes('403'));
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
            // webCoreReady 조건 추가
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

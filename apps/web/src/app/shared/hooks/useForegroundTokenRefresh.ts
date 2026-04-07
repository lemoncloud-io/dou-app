import { useEffect } from 'react';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';

export const useForegroundTokenRefresh = (refreshToken: () => Promise<boolean>) => {
    const { isAuthenticated } = useWebCoreStore();

    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState !== 'visible') return;
            if (!isAuthenticated) return;

            // 1. webCore 토큰 리프레시
            await refreshToken();

            // 2. cloud 토큰 리프레시
            if (cloudCore.getSelectedCloudId()) {
                void cloudCore.refreshToken();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [isAuthenticated, refreshToken]);
};

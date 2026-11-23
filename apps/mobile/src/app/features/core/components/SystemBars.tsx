import React, { useEffect } from 'react';
import { AppState, Dimensions, Platform, StatusBar } from 'react-native';

import { SystemBarsBridge } from '../../../bridge/SystemBarsBridge';
import { useResolvedTheme } from '../../../hooks';

const isLandscape = ({ width, height }: { width: number; height: number }): boolean => width > height;

const applySystemBars = (isDark: boolean): void => {
    StatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', true);

    if (Platform.OS === 'android') {
        void SystemBarsBridge.setAppearance(isDark);
    }
};

export const SystemBars = () => {
    const { isDark } = useResolvedTheme();
    const barStyle = isDark ? 'light-content' : 'dark-content';

    useEffect(() => {
        applySystemBars(isDark);

        const appStateSubscription = AppState.addEventListener('change', state => {
            if (state === 'active') applySystemBars(isDark);
        });

        let wasLandscape = isLandscape(Dimensions.get('window'));
        const dimensionsSubscription = Dimensions.addEventListener('change', ({ window }) => {
            const nowLandscape = isLandscape(window);
            if (nowLandscape === wasLandscape) return;
            wasLandscape = nowLandscape;
            applySystemBars(isDark);
        });

        return () => {
            appStateSubscription.remove();
            dimensionsSubscription.remove();
        };
    }, [isDark]);

    return <StatusBar barStyle={barStyle} />;
};

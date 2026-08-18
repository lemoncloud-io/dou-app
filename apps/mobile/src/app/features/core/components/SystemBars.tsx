import React, { useEffect } from 'react';
import { AppState, Dimensions, Platform, StatusBar } from 'react-native';

import { SystemBarsBridge } from '../../../bridge/SystemBarsBridge';
import { useResolvedTheme } from '../../../hooks';

/**
 * Push the current theme onto the OS system bars. Idempotent — calling it with an
 * unchanged value is the normal case, not a redundancy to optimize away.
 */
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

        // The OS resets system-bar appearance on foreground resume and on rotation. The theme
        // value has NOT changed at those moments, so an effect that only reacts to the value
        // would never re-run and the bars would stay wrong until the next theme change — which
        // is exactly how a mismatched status bar used to survive indefinitely.
        const appStateSubscription = AppState.addEventListener('change', state => {
            if (state === 'active') applySystemBars(isDark);
        });

        // 'change' also fires for keyboard-driven window resizes (Android adjustResize), so a
        // bare re-apply would cross the native bridge on every keyboard open/close. Only an
        // actual orientation flip can reset the bars, so track the landscape flag.
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

    return <StatusBar barStyle={barStyle} backgroundColor="transparent" translucent={true} />;
};

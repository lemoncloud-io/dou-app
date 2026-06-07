import React, { useEffect } from 'react';
import { Platform, StatusBar } from 'react-native';

import { SystemBarsBridge } from '../../../bridge/SystemBarsBridge';
import { useResolvedTheme } from '../../../hooks';

export const SystemBars = () => {
    const { isDark } = useResolvedTheme();
    const barStyle = isDark ? 'light-content' : 'dark-content';

    useEffect(() => {
        StatusBar.setBarStyle(barStyle, true);

        if (Platform.OS === 'android') {
            void SystemBarsBridge.setAppearance(isDark);
        }
    }, [barStyle, isDark]);

    return <StatusBar barStyle={barStyle} backgroundColor="transparent" translucent={true} />;
};

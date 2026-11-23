import React, { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { NavigationContainer } from '@react-navigation/native';

import { RootNavigator, navigationRef } from './features/core/navigation';
import { useAppVersionCheck, useResolvedTheme } from './hooks';
import { bootMetricsService, notificationService } from './services';
import { SystemBars } from './features/core/components';
import { BootSplashBridge } from './bridge';
import { useThemeStore } from './stores';

export const App = () => {
    const { hasUpdate, showUpdateAlert } = useAppVersionCheck(true);

    useEffect(() => {
        notificationService.createNotificationChannel();
    }, []);

    useEffect(() => {
        bootMetricsService.mark('app-mount');
    }, []);

    useEffect(() => {
        if (hasUpdate) {
            showUpdateAlert();
        }
    }, [hasUpdate, showUpdateAlert]);

    const theme = useThemeStore(state => state.theme);
    useEffect(() => {
        void BootSplashBridge.setStartupTheme(theme);
    }, [theme]);

    const { backgroundColor } = useResolvedTheme();

    return (
        <SafeAreaProvider initialMetrics={initialWindowMetrics} style={{ backgroundColor }}>
            <SystemBars />
            <NavigationContainer ref={navigationRef}>
                <View style={{ flex: 1, backgroundColor }}>
                    <RootNavigator />
                </View>
            </NavigationContainer>
        </SafeAreaProvider>
    );
};

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
    // No debug UI here any more — the FAB and the overlay are gone (ADR-0080 decision 12). Every debug
    // control lives in the web panel, and the app only executes what it is asked to. The unlock flag
    // itself is still meaningful: `AppWebView` injects `debugModeEnabled` so the web knows the 10-tap
    // unlock survived a reload (see `injectionScripts`).

    // Signal that Firebase is ready for deep link processing immediately
    useEffect(() => {
        notificationService.createNotificationChannel();
    }, []);

    // Boot timeline: root component tree committed.
    useEffect(() => {
        bootMetricsService.mark('app-mount');
    }, []);

    // Show update alert when update is available
    useEffect(() => {
        if (hasUpdate) {
            showUpdateAlert();
        }
    }, [hasUpdate, showUpdateAlert]);

    // Hand the in-app theme to the native splash for the NEXT launch — the one this launch's splash
    // could not know. Re-sent on every start too, so an install that chose its theme before this
    // existed is corrected from its second launch on.
    const theme = useThemeStore(state => state.theme);
    useEffect(() => {
        void BootSplashBridge.setStartupTheme(theme);
    }, [theme]);

    const { backgroundColor } = useResolvedTheme();

    return (
        // `initialWindowMetrics` seeds insets synchronously from the native initial frame, avoiding the
        // async insets round-trip that would otherwise delay the first render of the navigator/MainScreen.
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

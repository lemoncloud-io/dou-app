import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import Config from 'react-native-config';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { NavigationContainer } from '@react-navigation/native';

import { RootNavigator, navigationRef } from './features/core/navigation';
import { useAppVersionCheck, useResolvedTheme } from './hooks';
import { bootMetricsService, notificationService } from './services';
import { FloatingMenu, SystemBars } from './features/core/components';
import { DebugOverlay } from './features/debug';
import type { DebugOverlayEntryKey } from './features/debug/debugMenu';
import { useDebugSettingsStore } from './stores';

// Deep link / invite link / notification-tap capture is owned by useDeepLinkNavigation (mounted in
// MainScreen): it resolves each via DeeplinkService and emits OnNavigate (web) or drives navigationRef
// (native). React Navigation's linking config is intentionally unused, removing the getStateFromPath
// URL-transport hop and its triple normalization.
const SHOW_DEBUG_MENU = __DEV__ || Config.VITE_ENV !== 'PROD';

export const App = () => {
    const { hasUpdate, showUpdateAlert } = useAppVersionCheck(true);
    const [isDebugOverlayVisible, setDebugOverlayVisible] = useState(false);
    const [debugOverlayEntry, setDebugOverlayEntry] = useState<DebugOverlayEntryKey>('FeatureTests');
    // Runtime unlock propagated from the web 10-tap gesture — opens the debug
    // menu in PROD builds too (see usePerfHandler / SetDebugMode).
    const debugModeEnabled = useDebugSettingsStore(state => state.debugModeEnabled);
    const showDebugMenu = SHOW_DEBUG_MENU || debugModeEnabled;

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

    const openDebugOverlay = (entry: DebugOverlayEntryKey) => {
        setDebugOverlayEntry(entry);
        setDebugOverlayVisible(true);
    };

    const { backgroundColor } = useResolvedTheme();

    return (
        // `initialWindowMetrics` seeds insets synchronously from the native initial frame, avoiding the
        // async insets round-trip that would otherwise delay the first render of the navigator/MainScreen.
        <SafeAreaProvider initialMetrics={initialWindowMetrics} style={{ backgroundColor }}>
            <SystemBars />
            <NavigationContainer ref={navigationRef}>
                <View style={{ flex: 1, backgroundColor }}>
                    <RootNavigator />
                    {showDebugMenu && !isDebugOverlayVisible && (
                        <FloatingMenu onOpenDebug={openDebugOverlay} allowEnvironmentSettings={SHOW_DEBUG_MENU} />
                    )}
                    {showDebugMenu && isDebugOverlayVisible && (
                        <DebugOverlay initialEntry={debugOverlayEntry} onClose={() => setDebugOverlayVisible(false)} />
                    )}
                </View>
            </NavigationContainer>
        </SafeAreaProvider>
    );
};

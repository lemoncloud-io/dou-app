import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { NavigationContainer } from '@react-navigation/native';

import { RootNavigator, navigationRef } from './features/core/navigation';
import { useAppVersionCheck, useResolvedTheme } from './hooks';
import { bootMetricsService, notificationService } from './services';
import { FloatingMenu, SystemBars } from './features/core/components';
import { DebugOverlay } from './features/debug';
import type { DebugOverlayEntryKey } from './features/debug/debugMenu';
import { useDebugSettingsStore } from './stores';

export const App = () => {
    const { hasUpdate, showUpdateAlert } = useAppVersionCheck(true);
    const [isDebugOverlayVisible, setDebugOverlayVisible] = useState(false);
    const [debugOverlayEntry, setDebugOverlayEntry] = useState<DebugOverlayEntryKey>('FeatureTests');
    // The debug menu (native FAB) is NEVER shown by default in any build — the ONLY trigger is the
    // web 10-tap unlock, propagated here as `debugModeEnabled` (see usePerfHandler / SetDebugMode) and
    // cleared by the web on start / on disable (SetDebugMode(false)). Env no longer gates the menu;
    const debugModeEnabled = useDebugSettingsStore(state => state.debugModeEnabled);

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
                    {debugModeEnabled && !isDebugOverlayVisible && <FloatingMenu onOpenDebug={openDebugOverlay} />}
                    {debugModeEnabled && isDebugOverlayVisible && (
                        <DebugOverlay initialEntry={debugOverlayEntry} onClose={() => setDebugOverlayVisible(false)} />
                    )}
                </View>
            </NavigationContainer>
        </SafeAreaProvider>
    );
};

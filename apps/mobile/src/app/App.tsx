import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import Config from 'react-native-config';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NavigationContainer } from '@react-navigation/native';

import { RootNavigator, navigationRef } from './features/core/navigation';
import { useAppVersionCheck, useResolvedTheme } from './hooks';
import { notificationService } from './services';
import { FloatingMenu, SystemBars } from './features/core/components';
import { DebugOverlay } from './features/debug';
import type { DebugOverlayEntryKey } from './features/debug/debugMenu';

// Deep link / invite link / notification-tap capture is owned by useDeepLinkNavigation (mounted in
// MainScreen): it resolves each via DeeplinkService and emits OnNavigate (web) or drives navigationRef
// (native). React Navigation's linking config is intentionally unused, removing the getStateFromPath
// URL-transport hop and its triple normalization.
const SHOW_DEBUG_MENU = __DEV__ || Config.VITE_ENV !== 'PROD';

export const App = () => {
    const { hasUpdate, showUpdateAlert } = useAppVersionCheck(true);
    const [isDebugOverlayVisible, setDebugOverlayVisible] = useState(false);
    const [debugOverlayEntry, setDebugOverlayEntry] = useState<DebugOverlayEntryKey>('FeatureTests');

    // Signal that Firebase is ready for deep link processing immediately
    useEffect(() => {
        notificationService.createNotificationChannel();
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
        <SafeAreaProvider style={{ backgroundColor }}>
            <SystemBars />
            <NavigationContainer ref={navigationRef}>
                <View style={{ flex: 1, backgroundColor }}>
                    <RootNavigator />
                    {SHOW_DEBUG_MENU && !isDebugOverlayVisible && <FloatingMenu onOpenDebug={openDebugOverlay} />}
                    {SHOW_DEBUG_MENU && isDebugOverlayVisible && (
                        <DebugOverlay initialEntry={debugOverlayEntry} onClose={() => setDebugOverlayVisible(false)} />
                    )}
                </View>
            </NavigationContainer>
        </SafeAreaProvider>
    );
};

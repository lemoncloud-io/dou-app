import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import Config from 'react-native-config';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { LinkingOptions } from '@react-navigation/native';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';

import { getRouteStateFromDeepLinkPath } from './services/deeplinks/deeplinkUtils';
import type { RootStackParamList } from './features/core/navigation';
import { RootNavigator } from './features/core/navigation';
import { useAppVersionCheck, useResolvedTheme } from './hooks';
import { deeplinkService, logger, notificationService, offlinePushQueue } from './services';
import { FloatingMenu, SystemBars } from './features/core/components';
import { DebugOverlay } from './features/debug';
import type { DebugOverlayEntryKey } from './features/debug/debugMenu';

const navigationRef = createNavigationContainerRef<RootStackParamList>();
const SHOW_DEBUG_MENU = __DEV__ || Config.VITE_ENV !== 'PROD';

// React Navigation Linking Configuration
const linking: LinkingOptions<any> = {
    prefixes: [
        'chatic://',
        'chatic-dev://',
        'https://app.chatic.io',
        'https://app-dev.chatic.io',
        'https://dou.chatic.io',
        'https://dou-dev.chatic.io',
    ],
    async getInitialURL() {
        return deeplinkService.getInitialUrl();
    },
    subscribe(listener: (url: string) => void) {
        return deeplinkService.subscribe(listener);
    },
    getStateFromPath(path: string) {
        logger.info('DEEPLINK', '[AppLinking] getStateFromPath called', { path });
        const state = getRouteStateFromDeepLinkPath(path);
        logger.info('DEEPLINK', '[AppLinking] getStateFromPath result', {
            path,
            rootRoute: state?.routes?.[0]?.name,
            nestedRoute: state?.routes?.[0]?.state?.routes?.[0]?.name,
            nestedParams: state?.routes?.[0]?.state?.routes?.[0]?.params,
        });
        return state;
    },
};

export const App = () => {
    const { hasUpdate, showUpdateAlert } = useAppVersionCheck(true);
    const [isDebugOverlayVisible, setDebugOverlayVisible] = useState(false);
    const [debugOverlayEntry, setDebugOverlayEntry] = useState<DebugOverlayEntryKey>('FeatureTests');

    // Signal that Firebase is ready for deep link processing immediately
    useEffect(() => {
        notificationService.createNotificationChannel();
        void offlinePushQueue.flush();
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
            <NavigationContainer ref={navigationRef} linking={linking}>
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

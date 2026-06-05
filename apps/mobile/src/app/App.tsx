import React, { useEffect } from 'react';
import { StatusBar, useColorScheme, View } from 'react-native';
import Config from 'react-native-config';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { LinkingOptions } from '@react-navigation/native';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';

import { getRouteStateFromDeepLinkPath } from './services/deeplinks/deeplinkUtils';
import type { RootStackParamList } from './features/core/navigation';
import { RootNavigator } from './features/core/navigation';
import { useAppVersionCheck } from './hooks';
import { useThemeStore } from './stores';
import { deeplinkService, notificationService, offlinePushQueue } from './services';
import { FloatingMenu } from './features/core/components';

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
        return getRouteStateFromDeepLinkPath(path);
    },
};

export const App = () => {
    const systemColorScheme = useColorScheme();
    const theme = useThemeStore(state => state.theme);
    const isDarkMode = theme === 'dark' || (theme === 'system' && systemColorScheme === 'dark');

    const { hasUpdate, showUpdateAlert } = useAppVersionCheck(true);

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

    const handleNavigate = (screenName: keyof RootStackParamList) => {
        if (navigationRef.isReady()) {
            navigationRef.navigate(screenName as any);
        }
    };

    return (
        <SafeAreaProvider>
            <StatusBar
                barStyle={isDarkMode ? 'light-content' : 'dark-content'}
                backgroundColor="transparent"
                translucent={true}
            />
            <NavigationContainer ref={navigationRef} linking={linking}>
                <View style={{ flex: 1 }}>
                    <RootNavigator />
                    {SHOW_DEBUG_MENU && <FloatingMenu onNavigate={handleNavigate} />}
                </View>
            </NavigationContainer>
        </SafeAreaProvider>
    );
};

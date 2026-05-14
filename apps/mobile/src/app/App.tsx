import React, { useEffect } from 'react';
import { StatusBar, useColorScheme, View } from 'react-native';
import Config from 'react-native-config';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';

import { getDeepLinkManager } from '@chatic/deeplinks';
import type { RootStackParamList } from './features/core/navigation';
import { RootNavigator } from './features/core/navigation';
import { useAppVersionCheck, useInitializeDeepLink } from './hooks';
import { useThemeStore } from './stores';
import { notificationService } from './services';
import { FloatingMenu } from './features/core/components';

const navigationRef = createNavigationContainerRef<RootStackParamList>();
const SHOW_DEBUG_MENU = __DEV__ || Config.VITE_ENV !== 'PROD';

export const App = () => {
    const systemColorScheme = useColorScheme();
    const theme = useThemeStore(state => state.theme);
    const isDarkMode = theme === 'dark' || (theme === 'system' && systemColorScheme === 'dark');

    const { hasUpdate, showUpdateAlert } = useAppVersionCheck(true);

    // Initialize deep link listeners early (captures URLs immediately)
    useInitializeDeepLink();

    // Signal that Firebase is ready for deep link processing immediately
    useEffect(() => {
        notificationService.createNotificationChannel();
        getDeepLinkManager().setAppReady();
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
            <NavigationContainer ref={navigationRef}>
                <View style={{ flex: 1 }}>
                    <RootNavigator />
                    {SHOW_DEBUG_MENU && <FloatingMenu onNavigate={handleNavigate} />}
                </View>
            </NavigationContainer>
        </SafeAreaProvider>
    );
};

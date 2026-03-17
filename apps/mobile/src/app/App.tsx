import React, { useEffect, useState } from 'react';
import { StatusBar, useColorScheme, View } from 'react-native';
import Config from 'react-native-config';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';

import { FloatingMenu, useAppVersionCheck, useInitializeDeepLink, useThemeStore } from './common';
import type { RootStackParamList } from './navigation';
import { RootNavigator } from './navigation';
import { SplashScreen } from './features/main';

const navigationRef = createNavigationContainerRef<RootStackParamList>();
const SHOW_DEBUG_MENU = __DEV__ || Config.VITE_ENV !== 'PROD';

export const App = () => {
    const [isSplashVisible, setIsSplashVisible] = useState(true);

    const systemColorScheme = useColorScheme();
    const theme = useThemeStore(state => state.theme);
    const isDarkMode = theme === 'dark' || (theme === 'system' && systemColorScheme === 'dark');

    const { hasUpdate, showUpdateAlert } = useAppVersionCheck(true);

    useInitializeDeepLink();

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
            {isSplashVisible ? (
                <SplashScreen onFinish={() => setIsSplashVisible(false)} />
            ) : (
                <NavigationContainer ref={navigationRef}>
                    <View style={{ flex: 1 }}>
                        <RootNavigator />
                        {SHOW_DEBUG_MENU && <FloatingMenu onNavigate={handleNavigate} />}
                    </View>
                </NavigationContainer>
            )}
        </SafeAreaProvider>
    );
};

import React, { useEffect, useRef } from 'react';
import { StatusBar, useColorScheme, View } from 'react-native';
import Config from 'react-native-config';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';

import type { DeepLinkSource, ServiceEndpoints } from '@chatic/deeplinks';
import { getDeepLinkManager } from '@chatic/deeplinks';

import { useAppVersionCheck, useDeepLinkStore, useThemeStore } from './common';
import { FloatingMenu } from './common';
import type { RootStackParamList } from './navigation';
import { RootNavigator } from './navigation';
import { SplashScreen } from './features/main';

const navigationRef = createNavigationContainerRef<RootStackParamList>();

export const App = () => {
    const systemColorScheme = useColorScheme();
    const theme = useThemeStore(state => state.theme);

    // Compute isDarkMode based on theme setting
    const isDarkMode = theme === 'dark' || (theme === 'system' && systemColorScheme === 'dark');

    // Update StatusBar dynamically when theme changes
    useEffect(() => {
        StatusBar.setBarStyle(isDarkMode ? 'light-content' : 'dark-content', true);
    }, [isDarkMode]);

    const deepLinkManagerRef = useRef(getDeepLinkManager());

    const [isSplashVisible, setIsSplashVisible] = useState(true);
    // Check for app updates on mount
    const { hasUpdate, showUpdateAlert } = useAppVersionCheck(true);

    // Deep link state is managed via Zustand store
    // MainScreen will handle pendingUrl when WebView is ready

    /**
     * Production Release 상태일때만, 디버그 메뉴가 보이지 않음
     */
    const showDebugMenu = __DEV__ || Config.VITE_ENV !== 'PROD';

    const handleNavigate = (screenName: keyof RootStackParamList) => {
        if (navigationRef.isReady()) {
            navigationRef.navigate(screenName as any);
        }
    };

    // Initialize DeepLinkManager (runs once on mount)
    useEffect(() => {
        const manager = deepLinkManagerRef.current;

        manager.initialize({
            handleDeepLink: (url: string, source: DeepLinkSource, envs?: ServiceEndpoints) => {
                console.log('[App] Deep link received:', url, 'source:', source, 'envs:', envs);
                // Store in Zustand - WebView will pick up when ready
                useDeepLinkStore.getState().setPendingUrl(url, source, envs);
            },
        });

        return () => {
            manager.cleanup();
        };
    }, []);

    const handleSplashFinish = () => {
        setIsSplashVisible(false);
    };

    // Show update alert when update is available
    useEffect(() => {
        if (hasUpdate) {
            showUpdateAlert();
        }
    }, [hasUpdate, showUpdateAlert]);

    return (
        <SafeAreaProvider>
            <StatusBar
                barStyle={isDarkMode ? 'light-content' : 'dark-content'}
                backgroundColor="transparent"
                translucent={true}
            />
            {isSplashVisible ? (
                <SplashScreen onFinish={handleSplashFinish} />
            ) : (
                <NavigationContainer ref={navigationRef}>
                    <View style={{ flex: 1 }}>
                        <RootNavigator />
                        {showDebugMenu && <FloatingMenu onNavigate={handleNavigate} />}
                    </View>
                </NavigationContainer>
            )}
        </SafeAreaProvider>
    );
};

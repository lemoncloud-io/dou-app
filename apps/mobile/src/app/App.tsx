import React, { useEffect, useRef } from 'react';
import { StatusBar, View } from 'react-native';
import Config from 'react-native-config';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';

import { getDeepLinkManager } from '@chatic/deeplinks';

import { FloatingMenu, useDeepLinkStore } from './common';
import { RootNavigator } from './navigation';

import type { DeepLinkSource } from '@chatic/deeplinks';
import type { RootStackParamList } from './navigation';

const navigationRef = createNavigationContainerRef<RootStackParamList>();

function App() {
    const isDarkMode = false;
    const deepLinkManagerRef = useRef(getDeepLinkManager());

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
            handleDeepLink: (url: string, source: DeepLinkSource) => {
                console.log('[App] Deep link received:', url, 'source:', source);
                // Store in Zustand - WebView will pick up when ready
                useDeepLinkStore.getState().setPendingUrl(url, source);
            },
        });

        return () => {
            manager.cleanup();
        };
    }, []);

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
                    {showDebugMenu && <FloatingMenu onNavigate={handleNavigate} />}
                </View>
            </NavigationContainer>
        </SafeAreaProvider>
    );
}

export default App;

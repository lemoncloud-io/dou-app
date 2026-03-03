import React from 'react';
import { StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';

import { FloatingMenu } from './common';
import { RootNavigator } from './navigation';

import type { RootStackParamList } from './navigation';
import Config from 'react-native-config';

const navigationRef = createNavigationContainerRef<RootStackParamList>();

function App() {
    const isDarkMode = false;

    // Prod + Release 상태가 아닐때만 디버그 메뉴 노출
    const showDebugMenu = __DEV__ || Config.VITE_ENV !== 'PROD';
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
                    {showDebugMenu && <FloatingMenu onNavigate={handleNavigate} />}
                </View>
            </NavigationContainer>
        </SafeAreaProvider>
    );
}

export default App;

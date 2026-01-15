import React from 'react';
import { StatusBar, View, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';

import { FloatingMenu } from './common/components';
import { RootNavigator } from './navigation';

import type { RootStackParamList } from './navigation';

const navigationRef = createNavigationContainerRef<RootStackParamList>();

function App() {
    const isDarkMode = useColorScheme() === 'dark';

    const handleNavigate = (screenName: keyof RootStackParamList) => {
        if (navigationRef.isReady()) {
            navigationRef.navigate(screenName as any);
        }
    };

    return (
        <SafeAreaProvider>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
            <NavigationContainer ref={navigationRef}>
                <View style={{ flex: 1 }}>
                    <RootNavigator />
                    <FloatingMenu onNavigate={handleNavigate} />
                </View>
            </NavigationContainer>
        </SafeAreaProvider>
    );
}

export default App;

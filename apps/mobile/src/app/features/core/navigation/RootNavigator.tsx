import { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { MainScreen } from '../../main';
import { routeSubWebViewEvents, SubWebViewScreen } from '../../subWebView';
import { subWebViewService } from '../../../services';
import { navigationRef } from './navigationRef';

import type { RootStackParamList } from './type';

const RootStack = createNativeStackNavigator<RootStackParamList>();

// Single native stack hosting MainScreen directly. The former RootNavigator → MainNavigator two-layer
// nesting was collapsed to one native container to cut boot mount cost (see boot-optimization.md 4.3).
export const RootNavigator = () => {
    useEffect(() => routeSubWebViewEvents(subWebViewService, navigationRef), []);

    return (
        <RootStack.Navigator initialRouteName="Main" screenOptions={{ headerShown: false }}>
            <RootStack.Screen name="Main" component={MainScreen} />
            <RootStack.Screen
                name="SubWebView"
                component={SubWebViewScreen}
                // Full screen with no swipe-to-dismiss: closing goes through the bar's control or
                // Android back, so the web always hears about it.
                options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }}
            />
        </RootStack.Navigator>
    );
};

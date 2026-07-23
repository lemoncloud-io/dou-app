import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { MainScreen } from '../../main';

import type { RootStackParamList } from './type';

const RootStack = createNativeStackNavigator<RootStackParamList>();

// Single native stack hosting MainScreen directly. The former RootNavigator → MainNavigator two-layer
// nesting was collapsed to one native container to cut boot mount cost (see boot-optimization.md 4.3).
export const RootNavigator = () => {
    return (
        <RootStack.Navigator initialRouteName="Main" screenOptions={{ headerShown: false }}>
            <RootStack.Screen name="Main" component={MainScreen} />
        </RootStack.Navigator>
    );
};

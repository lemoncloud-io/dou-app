import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { DebugNavigator } from '../../debug';
import { MainNavigator } from '../../main';

import type { RootStackParamList } from './type';

const RootStack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator = () => {
    return (
        <RootStack.Navigator initialRouteName="Main" screenOptions={{ headerShown: false }}>
            <RootStack.Screen name="Debug" component={DebugNavigator} />
            <RootStack.Screen name="Main" component={MainNavigator} />
        </RootStack.Navigator>
    );
};

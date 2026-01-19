import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { DebugNavigator } from '../features/debug';
import { MainScreen } from '../features/main';
import { SampleNavigator } from '../features/sample';

import type { RootStackParamList } from './type';

const RootStack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator = () => {
    return (
        <RootStack.Navigator initialRouteName="Sample" screenOptions={{ headerShown: false }}>
            <RootStack.Screen name="Sample" component={SampleNavigator} />
            <RootStack.Screen name="Debug" component={DebugNavigator} />
            <RootStack.Screen name="Main" component={MainScreen} />
        </RootStack.Navigator>
    );
};

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { MainWebViewScreen } from '../features/main';
import { SampleNavigator } from '../features/sample';

import type { RootStackParamList } from './type';

const RootStack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator = () => {
    return (
        <RootStack.Navigator initialRouteName="Sample" screenOptions={{ headerShown: false }}>
            <RootStack.Screen name="Sample" component={SampleNavigator} />
            <RootStack.Screen name="Main" component={MainWebViewScreen} />
        </RootStack.Navigator>
    );
};

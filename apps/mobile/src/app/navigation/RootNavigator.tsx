import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { SampleNavigator } from '../features/sample';

export type RootStackParamList = {
    Sample: undefined;
    Main: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator = () => {
    return (
        <RootStack.Navigator initialRouteName="Sample" screenOptions={{ headerShown: false }}>
            <RootStack.Screen name="Sample" component={SampleNavigator} />
        </RootStack.Navigator>
    );
};

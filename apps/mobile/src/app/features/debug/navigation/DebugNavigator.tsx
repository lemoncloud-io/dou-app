import { View } from 'react-native';

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { DebugStackParamList } from '../../../navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type HomeScreenProps = NativeStackScreenProps<DebugStackParamList, 'Home'>;
export type SocketTestScreenProps = NativeStackScreenProps<DebugStackParamList, 'SocketTest'>;

const Stack = createNativeStackNavigator<DebugStackParamList>();

export const DebugNavigator = () => {
    return (
        <Stack.Navigator initialRouteName="Home">
            <Stack.Screen name="Home" component={View} />
            <Stack.Screen name="SocketTest" component={View} />
        </Stack.Navigator>
    );
};

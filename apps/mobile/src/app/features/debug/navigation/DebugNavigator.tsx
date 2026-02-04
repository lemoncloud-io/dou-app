import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { DebugHomeScreen } from '../screens';
import { SocketTestScreen } from '../screens';

import type { DebugStackParamList } from '../../../navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type HomeScreenProps = NativeStackScreenProps<DebugStackParamList, 'Home'>;
export type SocketTestScreenProps = NativeStackScreenProps<DebugStackParamList, 'SocketTest'>;

const Stack = createNativeStackNavigator<DebugStackParamList>();

export const DebugNavigator = () => {
    return (
        <Stack.Navigator
            initialRouteName="Home"
            screenOptions={{
                headerStyle: { backgroundColor: '#121212' },
                headerTintColor: '#FFFFFF',
                headerTitleStyle: { fontWeight: 'bold' },
                headerShadowVisible: false,
            }}
        >
            <Stack.Screen
                name="Home"
                component={DebugHomeScreen}
                options={{
                    title: '디버그 메뉴',
                }}
            />

            <Stack.Screen
                name="SocketTest"
                component={SocketTestScreen}
                options={{
                    title: '웹소켓 테스트',
                    headerBackButtonDisplayMode: 'minimal',
                }}
            />
        </Stack.Navigator>
    );
};

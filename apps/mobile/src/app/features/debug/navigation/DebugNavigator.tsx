import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import {
    DebugHomeScreen,
    DeeplinkTestScreen,
    DeviceTestScreen,
    FcmTestScreen,
    IapTestScreen,
    SocketTestScreen,
} from '../screens';

import type { DebugStackParamList } from '../../../navigation';

export type HomeScreenProps = NativeStackScreenProps<DebugStackParamList, 'Home'>;

const DebugStack = createNativeStackNavigator<DebugStackParamList>();

export const DebugNavigator = () => {
    return (
        <DebugStack.Navigator
            initialRouteName="Home"
            screenOptions={{
                headerStyle: { backgroundColor: '#121212' },
                headerTintColor: '#FFFFFF',
                headerTitleStyle: { fontWeight: 'bold' },
                headerShadowVisible: false,
            }}
        >
            <DebugStack.Screen
                name="Home"
                component={DebugHomeScreen}
                options={{
                    title: '디버그 메뉴',
                }}
            />

            <DebugStack.Screen
                name="SocketTest"
                component={SocketTestScreen}
                options={{
                    title: '웹소켓 테스트',
                    headerBackButtonDisplayMode: 'minimal',
                }}
            />
            <DebugStack.Screen
                name="InAppPurchaseTest"
                component={IapTestScreen}
                options={{
                    title: '인앱결제 테스트',
                    headerBackButtonDisplayMode: 'minimal',
                }}
            />
            <DebugStack.Screen
                name="FcmTest"
                component={FcmTestScreen}
                options={{
                    title: 'FCM 테스트',
                    headerBackButtonDisplayMode: 'minimal',
                }}
            />
            <DebugStack.Screen
                name="DeeplinkTest"
                component={DeeplinkTestScreen}
                options={{
                    title: '딥링크 테스트',
                    headerBackButtonDisplayMode: 'minimal',
                }}
            />
            <DebugStack.Screen
                name="DeviceTest"
                component={DeviceTestScreen}
                options={{
                    title: '디바이스 기능 테스트',
                    headerBackButtonDisplayMode: 'minimal',
                }}
            />
        </DebugStack.Navigator>
    );
};

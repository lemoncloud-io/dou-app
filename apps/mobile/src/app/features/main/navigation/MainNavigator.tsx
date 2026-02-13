import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../../navigation';
import { MainScreen } from '../screens';
import { ModalScreen } from '../screens/ModalScreen';

export type MainScreenProps = NativeStackScreenProps<MainStackParamList, 'Main'>;

const MainStack = createNativeStackNavigator<MainStackParamList>();

export const MainNavigator = () => {
    return (
        <MainStack.Navigator
            initialRouteName="Main"
            screenOptions={{
                headerShown: false,
            }}
        >
            <MainStack.Screen name="Main" component={MainScreen}></MainStack.Screen>
            <MainStack.Screen
                name="Modal"
                component={ModalScreen}
                options={{
                    presentation: 'transparentModal',
                    animation: 'fade',
                    gestureEnabled: true,
                }}
            />
        </MainStack.Navigator>
    );
};

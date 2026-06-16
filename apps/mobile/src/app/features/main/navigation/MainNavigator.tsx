import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../core/navigation';
import { MainScreen } from '../screens';

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
        </MainStack.Navigator>
    );
};

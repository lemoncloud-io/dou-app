import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { DetailsScreen } from '../screens';
import { HomeScreen } from '../screens';
import { ProfileScreen } from '../screens';
import { SettingsScreen } from '../screens';

import type { SampleStackParamList } from '../../../navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type HomeScreenProps = NativeStackScreenProps<SampleStackParamList, 'Home'>;
export type DetailsScreenProps = NativeStackScreenProps<SampleStackParamList, 'Details'>;
export type SettingsScreenProps = NativeStackScreenProps<SampleStackParamList, 'Settings'>;
export type ProfileScreenProps = NativeStackScreenProps<SampleStackParamList, 'Profile'>;

const Stack = createNativeStackNavigator<SampleStackParamList>();

export const SampleNavigator = () => {
    return (
        <Stack.Navigator
            initialRouteName="Home"
            screenOptions={{
                headerStyle: { backgroundColor: '#007AFF' },
                headerTintColor: '#fff',
                headerTitleStyle: { fontWeight: 'bold' },
            }}
        >
            <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Chatic Home' }} />
            <Stack.Screen
                name="Details"
                component={DetailsScreen}
                options={({ route }) => ({ title: route.params.title })}
            />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
            <Stack.Screen
                name="Profile"
                component={ProfileScreen}
                options={({ route }) => ({ title: route.params.name })}
            />
        </Stack.Navigator>
    );
};

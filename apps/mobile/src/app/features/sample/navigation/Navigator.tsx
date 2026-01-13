import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { DetailsScreen } from '../screens/DetailsScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

import type { SampleStackParamList } from './types';

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

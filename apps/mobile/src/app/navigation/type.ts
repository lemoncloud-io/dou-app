import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type SampleStackParamList = {
    Home: undefined;
    Details: { itemId: number; title: string };
    Settings: undefined;
    Profile: { userId: string; name: string };
};

export type RootStackParamList = {
    Sample: NavigatorScreenParams<SampleStackParamList>;
    Main: undefined;
};

export type HomeScreenProps = NativeStackScreenProps<SampleStackParamList, 'Home'>;
export type DetailsScreenProps = NativeStackScreenProps<SampleStackParamList, 'Details'>;
export type SettingsScreenProps = NativeStackScreenProps<SampleStackParamList, 'Settings'>;
export type ProfileScreenProps = NativeStackScreenProps<SampleStackParamList, 'Profile'>;

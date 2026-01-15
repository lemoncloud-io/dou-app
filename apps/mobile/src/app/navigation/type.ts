import type { NavigatorScreenParams } from '@react-navigation/native';

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

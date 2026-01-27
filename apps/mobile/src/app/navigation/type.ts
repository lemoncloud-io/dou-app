import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
    Main: undefined;
    Debug: NavigatorScreenParams<DebugStackParamList>;
};

export type DebugStackParamList = {
    Home: undefined;
    SocketTest: undefined;
};

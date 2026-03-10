import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
    Main: NavigatorScreenParams<MainStackParamList>;
    Debug: NavigatorScreenParams<DebugStackParamList>;
};

export type DebugStackParamList = {
    Home: undefined;
    SocketTest: undefined;
    InAppPurchaseTest: undefined;
    FcmTest: undefined;
    DeeplinkTest: undefined;
    DeviceTest: undefined;
    BridgeTest: undefined;
};

export type MainStackParamList = {
    Main: undefined;
    Modal: ModalScreenParams;
};

export type ModalScreenParams = {
    url: string;
    type: 'full' | 'sheet';
    heightRatio?: number;
    dragHandle?: boolean;
};

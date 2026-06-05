import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
    Main: NavigatorScreenParams<MainStackParamList>;
    Debug: NavigatorScreenParams<DebugStackParamList>;
};

export type DebugStackParamList = {
    Home: undefined;
    SocketTest: undefined;
    InAppPurchaseTest: undefined;
    NotificationTest: undefined;
    DeeplinkTest: undefined;
    DeviceTest: undefined;
    AppIconTest: undefined;
    BridgeTest: undefined;
    OAuthTest: undefined;
    StorageTest: undefined;
    SmsTest: undefined;
    UploadTest: undefined;
};

export type MainStackParamList = {
    Main:
        | {
              url?: string;
              error?: string;
          }
        | undefined;
    Modal: ModalScreenParams;
};

export type ModalScreenParams = {
    url: string;
    type: 'full' | 'sheet';
    heightRatio?: number;
    dragHandle?: boolean;
};

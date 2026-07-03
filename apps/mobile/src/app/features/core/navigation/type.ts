import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
    Main: NavigatorScreenParams<MainStackParamList>;
};

export type MainStackParamList = {
    // The Main screen no longer receives deep link data via route params — inbound navigation is
    // delivered to the WebView through OnNavigate (see useDeepLinkNavigation).
    Main: undefined;
};

export type ModalScreenParams = {
    url: string;
    type: 'full' | 'sheet';
    heightRatio?: number;
    dragHandle?: boolean;
};

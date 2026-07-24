export type RootStackParamList = {
    // Single native stack: RootNavigator hosts MainScreen directly (the former MainNavigator layer was
    // removed for boot performance — see boot-optimization.md 4.3). The Main screen takes no route
    // params: deep link destinations reach the WebView via OnNavigate (see useDeepLinkNavigation).
    Main: undefined;
};

export type ModalScreenParams = {
    url: string;
    type: 'full' | 'sheet';
    heightRatio?: number;
    dragHandle?: boolean;
};

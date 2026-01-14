import React, { useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { createBridge } from '../../../common/webview/bridge';

import type { AppMessageData } from '@chatic/app-messages';

export const MainWebViewScreen = () => {
    const webViewRef = useRef<WebView>(null);
    const insets = useSafeAreaInsets();

    const bridge = createBridge(webViewRef);

    const safeAreaMessage: AppMessageData<'SetSafeArea'> = {
        type: 'SetSafeArea',
        data: {
            top: insets.top,
            bottom: insets.bottom,
            left: insets.left,
            right: insets.right,
        },
    };
    const webviewUrl = process.env.WEBVIEW_BASE_URL;

    return (
        <WebView
            ref={webViewRef}
            source={{ uri: webviewUrl }}
            onLoadEnd={() => {
                bridge.post(safeAreaMessage);
            }}
            startInLoadingState={true}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowsBackForwardNavigationGestures={true}
        />
    );
};

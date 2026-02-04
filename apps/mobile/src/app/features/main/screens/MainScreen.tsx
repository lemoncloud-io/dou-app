import React, { useMemo, useRef, useState } from 'react';

import { AppWebView, Logger } from '../../../common';
import { useAndroidBack } from '../../../common/webview/hooks';
import { useAppBridge } from '../../../common/webview/hooks';
import { useFcmHandler } from '../../../common/webview/hooks';
import { useSafeAreaHandler } from '../../../common/webview/hooks';

import type { WebMessageData, WebMessageType } from '@chatic/app-messages';
import type { WebView, WebViewMessageEvent } from 'react-native-webview';
import type { WebViewMessage } from 'react-native-webview/lib/WebViewTypes';

const webviewUrl = process.env.VITE_WEBVIEW_BASE_URL;

export const MainScreen = () => {
    const webViewRef = useRef<WebView>(null);
    const [canGoBack, setCanGoBack] = useState(false);

    const { bridge } = useAppBridge(webViewRef);
    const { setSafeAreaInfo } = useSafeAreaHandler(bridge);
    const { setFcmToken } = useFcmHandler(bridge);

    useAndroidBack(webViewRef, canGoBack);

    /**
     * //TODO: Not Implement
     * @author raine@lemoncloud.io
     */
    const handleMessage: (event: WebViewMessageEvent) => void = useMemo(() => {
        return bridge.receive(
            (message: WebMessageData<WebMessageType>) => {
                switch (message.type) {
                    case 'GetFcmToken': {
                        void setFcmToken();
                        break;
                    }
                    case 'GetSafeArea': {
                        setSafeAreaInfo();
                        break;
                    }
                    default:
                        Logger.error('BRIDGE', `Failed received error. : ${message.type}`);
                }
            },
            (error: any, nativeEvent: WebViewMessage) => {
                Logger.error('BRIDGE', `Failed parse message error. : ${nativeEvent.data}`, error);
            }
        );
    }, [bridge, setFcmToken, setSafeAreaInfo]);

    return (
        <AppWebView
            ref={webViewRef}
            source={{ uri: webviewUrl }}
            onMessage={handleMessage}
            onNavigationStateChange={navState => {
                setCanGoBack(navState.canGoBack);
            }}
        />
    );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppWebView, useWebViewBridge } from '../../../common/webview';

import type { AppMessageData, WebMessageData, WebMessageType } from '@chatic/app-messages';
import type { WebView, WebViewMessageEvent } from 'react-native-webview';
import type { WebViewMessage } from 'react-native-webview/lib/WebViewTypes';

const webviewUrl: string = process.env.WEBVIEW_BASE_URL;

export const MainScreen = () => {
    const webViewRef = useRef<WebView>(null);
    const insets = useSafeAreaInsets();
    const bridge = useWebViewBridge(webViewRef);
    const [canGoBack, setCanGoBack] = useState(false);

    // Control Android HardwareBackPress
    useEffect(() => {
        if (Platform.OS !== 'android') return;
        const onBackPress = () => {
            if (canGoBack && webViewRef.current) {
                webViewRef.current.goBack();
                return true;
            }
            return false;
        };

        const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => subscription.remove();
    }, [canGoBack]);

    // Send SafeArea Info
    const sendSafeAreaInfo = () => {
        const safeAreaMessage: AppMessageData<'SetSafeArea'> = {
            type: 'SetSafeArea',
            data: {
                top: insets.top,
                bottom: insets.bottom,
                left: insets.left,
                right: insets.right,
            },
        };
        bridge.post(safeAreaMessage);
    };

    /**
     * //TODO: Not Implement
     * @author raine@lemoncloud.io
     */
    const handleMessage: (event: WebViewMessageEvent) => void = useMemo(() => {
        return bridge.receive(
            (message: WebMessageData<WebMessageType>) => {
                switch (message.type) {
                    case 'SetCanGoBack':
                        break;
                    case 'ShowLoader':
                        break;
                    case 'HideLoader':
                        break;
                    case 'SyncDeviceInfo':
                        break;
                    case 'SyncCredential':
                        break;
                    case 'PopWebView':
                        break;
                    case 'OnScroll':
                        break;
                    default:
                        console.log('Received message', message);
                }
            },
            (error: any, nativeEvent: WebViewMessage) => {
                console.error('[App] Failed to receive message:', error, nativeEvent.data);
            }
        );
    }, [bridge]);

    return (
        <AppWebView
            ref={webViewRef}
            source={{ uri: webviewUrl }}
            onLoadEnd={sendSafeAreaInfo}
            onMessage={handleMessage}
            onNavigationStateChange={navState => {
                setCanGoBack(navState.canGoBack);
            }}
        />
    );
};

import { useAppBridgeHost } from './useBaseBridge';
import type { WebView } from 'react-native-webview';
import type { RefObject } from 'react';

export const useAppBridge = (webViewRef: RefObject<WebView | null>) => {
    const { appBridgeHost, onMessage } = useAppBridgeHost(webViewRef);

    return { bridge: appBridgeHost, onMessage };
};

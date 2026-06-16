import { useAppBridgeHost } from './useBaseBridge';
import type { WebView } from 'react-native-webview';
import type { RefObject } from 'react';

export const useAppBridge = (webViewRef: RefObject<WebView | null>, onAppReady?: () => void) => {
    const { appBridgeHost, onMessage } = useAppBridgeHost(webViewRef, onAppReady);

    return { bridge: appBridgeHost, onMessage };
};

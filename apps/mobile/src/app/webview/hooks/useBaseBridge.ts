import type { IAppBridgeHost } from '@chatic/bridges';
import { AppBridgeHost } from '@chatic/bridges';
import { type RefObject, useCallback, useMemo } from 'react';
import type { WebView, WebViewMessageEvent } from 'react-native-webview';

export const useAppBridgeHost = (webViewRef: RefObject<WebView | null>) => {
    const appBridgeHost: IAppBridgeHost = useMemo(
        () =>
            new AppBridgeHost({
                sendToWeb: (message: string) => {
                    webViewRef.current?.postMessage(message);
                },
            }),
        [webViewRef]
    );

    const onMessage = useCallback(
        (event: WebViewMessageEvent) => {
            appBridgeHost.handleMessage(event.nativeEvent.data);
        },
        [appBridgeHost]
    );

    return { appBridgeHost, onMessage };
};

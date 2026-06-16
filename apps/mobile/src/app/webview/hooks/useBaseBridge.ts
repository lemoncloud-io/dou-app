import type { IAppBridgeHost } from '@chatic/bridges';
import { AppBridgeHost } from '@chatic/bridges';
import { type RefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import type { WebView, WebViewMessageEvent } from 'react-native-webview';

export const useAppBridgeHost = (webViewRef: RefObject<WebView | null>, onAppReady?: () => void) => {
    const onAppReadyRef = useRef(onAppReady);
    useEffect(() => {
        onAppReadyRef.current = onAppReady;
    }, [onAppReady]);

    const appBridgeHost: IAppBridgeHost = useMemo(
        () =>
            new AppBridgeHost({
                sendToWeb: (message: string) => {
                    webViewRef.current?.postMessage(message);
                },
                onAppReady: () => {
                    onAppReadyRef.current?.();
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

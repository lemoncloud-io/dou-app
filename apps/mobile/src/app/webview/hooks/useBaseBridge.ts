import type { IAppBridgeHost } from '@chatic/bridges';
import { AppBridgeHost } from '@chatic/bridges';
import { type RefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import type { WebView, WebViewMessageEvent } from 'react-native-webview';
import { TARGET_VERSION } from '../../database/sqlite/schema';
import { SUPPORTED_CACHE_TYPES } from '../../services/cache/CacheCrudService';

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
                // Local-cache capability, reported in the handshake so a web build deployed ahead of
                // this app can route domains this build cannot store to its own storage instead of
                // writing into a silent void. Both are plain constants — importing them does NOT
                // open SQLite, so the boot critical path is unaffected (boot-optimization.md 4.4).
                cacheSchemaVersion: TARGET_VERSION,
                supportedCacheTypes: [...SUPPORTED_CACHE_TYPES],
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

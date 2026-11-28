import type { WebAppReadyPayload } from '@chatic/bridge-messages';
import type { IAppBridgeHost } from '@chatic/bridges';
import { AppBridgeHost } from '@chatic/bridges';
import { type RefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import type { WebView, WebViewMessageEvent } from 'react-native-webview';
import { SUPPORTED_CACHE_TYPES, TARGET_VERSION } from '@chatic/db-sqlite';
import { resolveCacheDomainVersions } from '../../services/cache/cacheDomainVersions';
import { logger } from '../../services';
import { useDebugSettingsStore } from '../../stores';
import { isTrustedBridgeUrl } from '../utils/urlTrust';

export const useAppBridgeHost = (
    webViewRef: RefObject<WebView | null>,
    onAppReady?: (payload: WebAppReadyPayload) => void
) => {
    const onAppReadyRef = useRef(onAppReady);
    useEffect(() => {
        onAppReadyRef.current = onAppReady;
    }, [onAppReady]);

    useEffect(() => {
        resolveCacheDomainVersions().catch(() => undefined);
    }, []);

    const appBridgeHost: IAppBridgeHost = useMemo(
        () =>
            new AppBridgeHost({
                sendToWeb: (message: string) => {
                    webViewRef.current?.postMessage(message);
                },
                onAppReady: payload => {
                    onAppReadyRef.current?.(payload);
                },
                cacheSchemaVersion: TARGET_VERSION,
                supportedCacheTypes: [...SUPPORTED_CACHE_TYPES],
                resolveCacheDomainVersions,
                subWebViewOpenScope: 'anyHttps',
            }),
        [webViewRef]
    );

    const baseUrl = useDebugSettingsStore(state => state.getResolvedWebviewBaseUrl());
    const onMessage = useCallback(
        (event: WebViewMessageEvent) => {
            if (!isTrustedBridgeUrl(event.nativeEvent.url, baseUrl)) {
                logger.warn('BRIDGE', 'message dropped: untrusted origin', { url: event.nativeEvent.url });
                return;
            }
            appBridgeHost.handleMessage(event.nativeEvent.data);
        },
        [appBridgeHost, baseUrl]
    );

    return { appBridgeHost, onMessage };
};

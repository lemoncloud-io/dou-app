import type { IAppBridgeHost } from '@chatic/bridges';
import { AppBridgeHost } from '@chatic/bridges';
import { type RefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import type { WebView, WebViewMessageEvent } from 'react-native-webview';
import { TARGET_VERSION } from '../../database/sqlite/schema';
import { SUPPORTED_CACHE_TYPES } from '../../services/cache/CacheCrudService';
import { resolveCacheDomainVersions } from '../../services/cache/cacheDomainVersions';

export const useAppBridgeHost = (webViewRef: RefObject<WebView | null>, onAppReady?: () => void) => {
    const onAppReadyRef = useRef(onAppReady);
    useEffect(() => {
        onAppReadyRef.current = onAppReady;
    }, [onAppReady]);

    // Warm the contract measurement while the WebView loads its bundle, so the handshake below can
    // answer from a settled promise instead of waiting on SQLite.
    //
    // The measurement is what the web reads to decide where each cache domain is stored, and it is
    // read ONCE, when the data runtime assembles its storages — a reply that lands after that
    // leaves a domain on web storage for the whole session. Bundle load dwarfs opening the DB, so
    // starting here turns a serial cost into a parallel one. The handshake reuses this same
    // in-flight promise, and handles the result — this call only needs the work started.
    //
    // The resolver is documented not to reject, but this call swallows one anyway: nothing here
    // consumes the result, so a rejection would have no handler at all and surface as an unhandled
    // rejection during mount. A warm-up must not be able to break the screen it warms.
    useEffect(() => {
        resolveCacheDomainVersions().catch(() => undefined);
    }, []);

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
                // writing into a silent void.
                //
                // The two constants are the fallback report (and what older web bundles read); the
                // resolver below is the real answer, measured from the DB this install actually
                // reached (ADR-0053). It is memoized, so this shares the promise the warm-up effect
                // above already started.
                cacheSchemaVersion: TARGET_VERSION,
                supportedCacheTypes: [...SUPPORTED_CACHE_TYPES],
                resolveCacheDomainVersions,
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

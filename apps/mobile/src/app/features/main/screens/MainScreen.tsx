import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { WebView } from 'react-native-webview';
import { View } from 'react-native';
import type { WebAppReadyPayload } from '@chatic/app-messages';

import { useWebViewNavigation } from '../../../webview/hooks/useWebViewNavigation';
import { useDeepLinkNavigation } from '../../../webview/hooks/useDeepLinkNavigation';
import { AppWebView } from '../../../webview';
import { DeepLinkErrorView } from '../../core/components';
import type { MainScreenProps } from '../navigation';
import { useAppBridge } from '../../../webview/hooks';
import { bootMetricsService, bootSplashService, logger } from '../../../services';
import { useResolvedTheme } from '../../../hooks';
import { useDebugRuntimeStore, useDebugSettingsStore } from '../../../stores';
import { useCustomZipBootGate } from '../../../customZip';

export const MainScreen = ({ route }: MainScreenProps) => {
    const webViewRef = useRef<WebView>(null);
    const updateWebViewState = useDebugRuntimeStore(state => state.updateWebViewState);

    // Nothing native covers the WebView while it boots: the launch splash (native) stays up until the
    // web reports its first screen, and the web keeps its own cover until then, so there is no
    // window in which this screen has to hide a half-loaded page. The handshake only matters for an
    // older web build, which never reports a first screen and is revealed on the handshake instead.
    const handleAppReady = useCallback((payload: WebAppReadyPayload) => {
        logger.debug('WEBVIEW', 'WebAppReady received in MainScreen');
        bootMetricsService.mark('web-app-ready');
        bootSplashService.onWebAppReady(payload);
    }, []);

    const { bridge, onMessage } = useAppBridge(webViewRef, handleAppReady);
    const { backgroundColor } = useResolvedTheme();
    const webViewBaseUrl = useDebugSettingsStore(state => state.getResolvedWebviewBaseUrl());
    const webViewReloadToken = useDebugRuntimeStore(state => state.webViewReloadToken);

    // Custom zip restore gate: if a persisted localRoot exists, hold off mounting the WebView until
    // the local server comes up (loading localhost before the server starts means a blank screen —
    // customZipServerUrl is only set after the server has started).
    const { isRestoringCustomZip } = useCustomZipBootGate();

    const { setNavCanGoBack } = useWebViewNavigation(bridge);
    // Single owner of inbound navigation: OS deep links, invite links, and notification taps → OnNavigate.
    const { deepLinkError, deepLinkErrorReason, handleDismissError } = useDeepLinkNavigation(bridge);

    // source is not frozen at mount time — it's derived from the resolved base URL, so that
    // toggling the custom zip on/off is reflected when the origin changes; reloading happens via a
    // reloadToken key remount.
    const webViewSource = useMemo(() => ({ uri: webViewBaseUrl }), [webViewBaseUrl]);

    // The error view replaces the WebView, so nothing will ever report a first screen; lift the
    // splash so the error is seen now rather than at the native cap.
    useEffect(() => {
        if (deepLinkError) bootSplashService.onLoadFailed();
    }, [deepLinkError]);

    // Boot timeline: WebView screen mounted — network load starts right after.
    useEffect(() => {
        bootMetricsService.mark('main-screen-mount');
    }, []);

    // Still under the launch splash at boot, so the theme background is all this needs to be.
    if (!webViewBaseUrl || isRestoringCustomZip) {
        return <View style={{ flex: 1, backgroundColor }} />;
    }

    if (deepLinkError) {
        return <DeepLinkErrorView onGoHome={handleDismissError} reason={deepLinkErrorReason} />;
    }

    return (
        <View style={{ flex: 1, backgroundColor }}>
            <AppWebView
                key={webViewReloadToken}
                ref={webViewRef}
                source={webViewSource}
                bridge={bridge}
                onMessage={onMessage}
                scrollEnabled={false}
                onLoadStart={event => {
                    bootMetricsService.mark('load-start');
                    updateWebViewState({
                        isLoading: true,
                        currentUrl: event.nativeEvent.url,
                        lastLoadStartUrl: event.nativeEvent.url,
                    });
                    logger.debug('DEEPLINK', '[MainScreen] WebView load started', {
                        url: event.nativeEvent.url,
                        routeParams: route.params,
                    });
                }}
                onLoadEnd={event => {
                    bootMetricsService.mark('load-end');
                    updateWebViewState({
                        isLoading: false,
                        currentUrl: event.nativeEvent.url,
                        lastLoadEndUrl: event.nativeEvent.url,
                    });
                    logger.debug('DEEPLINK', '[MainScreen] WebView load ended', {
                        url: event.nativeEvent.url,
                        routeParams: route.params,
                    });
                }}
                onNavigationStateChange={navState => {
                    updateWebViewState({
                        currentUrl: navState.url,
                        isLoading: navState.loading,
                        canGoBack: navState.canGoBack,
                        canGoForward: navState.canGoForward,
                    });
                    logger.debug('DEEPLINK', '[MainScreen] WebView navigation state changed', {
                        url: navState.url,
                        loading: navState.loading,
                        canGoBack: navState.canGoBack,
                        routeParams: route.params,
                    });
                    setNavCanGoBack(navState.canGoBack);
                }}
                onError={event => {
                    updateWebViewState({
                        isLoading: false,
                        lastError: event.nativeEvent.description,
                    });
                    bootSplashService.onLoadFailed();
                }}
            />
        </View>
    );
};

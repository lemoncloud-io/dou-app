import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WebView } from 'react-native-webview';
import { Image, StyleSheet, View } from 'react-native';

import { useWebViewNavigation } from '../../../webview/hooks/useWebViewNavigation';
import { useDeepLinkNavigation } from '../../../webview/hooks/useDeepLinkNavigation';
import { AppWebView } from '../../../webview';
import { DeepLinkErrorView, ResumeOverlay } from '../../core/components';
import type { MainScreenProps } from '../navigation';
import { useAppBridge } from '../../../webview/hooks';
import { bootMetricsService, logger } from '../../../services';
import { useResolvedTheme } from '../../../hooks';
import { useDebugRuntimeStore, useDebugSettingsStore } from '../../../stores';
import { useCustomZipBootGate } from '../../../customZip';

export const MainScreen = ({ route }: MainScreenProps) => {
    const webViewRef = useRef<WebView>(null);
    const [isWebAppReady, setIsWebAppReady] = useState(false);
    const webAppReadyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const updateWebViewState = useDebugRuntimeStore(state => state.updateWebViewState);

    const handleAppReady = useCallback(() => {
        logger.debug('WEBVIEW', 'WebAppReady received in MainScreen');
        bootMetricsService.mark('web-app-ready');
        if (webAppReadyTimeoutRef.current) clearTimeout(webAppReadyTimeoutRef.current);
        setIsWebAppReady(true);
    }, []);

    const { bridge, onMessage } = useAppBridge(webViewRef, handleAppReady);
    const { isDark, backgroundColor } = useResolvedTheme();
    const webViewBaseUrl = useDebugSettingsStore(state => state.getResolvedWebviewBaseUrl());
    const webViewReloadToken = useDebugRuntimeStore(state => state.webViewReloadToken);

    // Custom zip restore gate: if a persisted localRoot exists, hold off mounting the WebView until
    // the local server comes up (loading localhost before the server starts means a blank screen —
    // customZipServerUrl is only set after the server has started).
    const { isRestoringCustomZip } = useCustomZipBootGate();

    const { setNavCanGoBack } = useWebViewNavigation(bridge);
    // Single owner of inbound navigation: OS deep links, invite links, and notification taps → OnNavigate.
    const { deepLinkError, deepLinkErrorReason, handleDismissError, isRedirecting, handleWebViewLoad } =
        useDeepLinkNavigation(bridge);

    // source is not frozen at mount time — it's derived from the resolved base URL, so that
    // toggling the custom zip on/off is reflected when the origin changes; reloading happens via a
    // reloadToken key remount.
    const webViewSource = useMemo(() => ({ uri: webViewBaseUrl }), [webViewBaseUrl]);

    const handleWebViewLoadStart = useCallback(() => {
        // If the web app is already ready (e.g. from SPA navigation), don't flip the state back to not-ready (false).
        if (isWebAppReady) return;

        if (webAppReadyTimeoutRef.current) clearTimeout(webAppReadyTimeoutRef.current);
        webAppReadyTimeoutRef.current = setTimeout(() => {
            logger.debug('WEBVIEW', 'WebAppReady fallback timeout reached');
            setIsWebAppReady(true);
        }, 1000);
    }, [isWebAppReady]);

    useEffect(() => {
        // Reset the ready state only when a full WebView reload occurs (Reload Token change).
        setIsWebAppReady(false);
    }, [webViewReloadToken]);

    useEffect(() => {
        return () => {
            if (webAppReadyTimeoutRef.current) clearTimeout(webAppReadyTimeoutRef.current);
        };
    }, []);

    // Boot timeline: WebView screen mounted — network load starts right after.
    useEffect(() => {
        bootMetricsService.mark('main-screen-mount');
    }, []);

    if (!webViewBaseUrl || isRestoringCustomZip) {
        return (
            <View style={[loadingStyles.container, { backgroundColor }]}>
                <Image
                    source={require('../../../../assets/logo.png')}
                    style={loadingStyles.logo}
                    resizeMode="contain"
                />
            </View>
        );
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
                onLoad={handleWebViewLoad}
                onLoadStart={event => {
                    bootMetricsService.mark('load-start');
                    handleWebViewLoadStart();
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
                }}
            />
            {(!isWebAppReady || isRedirecting) && <ResumeOverlay isDark={isDark} />}
        </View>
    );
};

const loadingStyles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logo: {
        width: 96,
        height: 96,
    },
});

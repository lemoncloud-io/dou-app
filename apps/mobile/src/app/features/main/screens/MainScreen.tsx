import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { WebView } from 'react-native-webview';
import { Image, StyleSheet, View } from 'react-native';

import { useWebViewDeepLink } from '../../../webview/hooks/useWebViewDeepLink';
import { useWebViewNavigation } from '../../../webview/hooks/useWebViewNavigation';
import { AppWebView } from '../../../webview';
import { DeepLinkErrorView, ResumeOverlay } from '../../core/components';
import type { MainScreenProps } from '../navigation';
import { useAppBridge } from '../../../webview/hooks';
import { logger } from '../../../services';
import { useResolvedTheme } from '../../../hooks';
import { useDebugRuntimeStore, useDebugSettingsStore } from '../../../stores';

export const MainScreen = ({ route }: MainScreenProps) => {
    const webViewRef = useRef<WebView>(null);
    const [isWebAppReady, setIsWebAppReady] = useState(false);
    const webAppReadyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const updateWebViewState = useDebugRuntimeStore(state => state.updateWebViewState);

    const handleAppReady = useCallback(() => {
        logger.info('WEBVIEW', 'WebAppReady received in MainScreen');
        if (webAppReadyTimeoutRef.current) clearTimeout(webAppReadyTimeoutRef.current);
        setIsWebAppReady(true);
    }, []);

    const { bridge, onMessage } = useAppBridge(webViewRef, handleAppReady);
    const { isDark } = useResolvedTheme();
    const webViewBaseUrl = useDebugSettingsStore(state => state.getResolvedWebviewBaseUrl());
    const webViewReloadToken = useDebugRuntimeStore(state => state.webViewReloadToken);

    const { setNavCanGoBack } = useWebViewNavigation(bridge);
    const { source, handleWebViewLoad, deepLinkError, deepLinkErrorReason, handleDismissError, isRedirecting } =
        useWebViewDeepLink(route, {
            webViewBaseUrl,
            reloadToken: webViewReloadToken,
            bridge,
        });

    const handleWebViewLoadStart = useCallback(() => {
        // 이미 웹앱 준비 완료 상태인 경우(SPA 네비게이션 등), 상태를 다시 준비중(false)으로 되돌리지 않습니다.
        if (isWebAppReady) return;

        if (webAppReadyTimeoutRef.current) clearTimeout(webAppReadyTimeoutRef.current);
        webAppReadyTimeoutRef.current = setTimeout(() => {
            logger.info('WEBVIEW', 'WebAppReady fallback timeout reached');
            setIsWebAppReady(true);
        }, 1000);
    }, [isWebAppReady]);

    useEffect(() => {
        // 웹뷰 전체 새로고침(Reload Token 변경) 발생 시에만 준비 상태를 초기화합니다.
        setIsWebAppReady(false);
    }, [webViewReloadToken]);

    useEffect(() => {
        return () => {
            if (webAppReadyTimeoutRef.current) clearTimeout(webAppReadyTimeoutRef.current);
        };
    }, []);

    if (!source) {
        return (
            <View style={[loadingStyles.container, { backgroundColor: isDark ? '#121212' : '#ffffff' }]}>
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
        <View style={{ flex: 1, backgroundColor: isDark ? '#121212' : '#ffffff' }}>
            <AppWebView
                ref={webViewRef}
                source={source}
                bridge={bridge}
                onMessage={onMessage}
                scrollEnabled={false}
                onLoad={handleWebViewLoad}
                onLoadStart={event => {
                    handleWebViewLoadStart();
                    updateWebViewState({
                        isLoading: true,
                        currentUrl: event.nativeEvent.url,
                        lastLoadStartUrl: event.nativeEvent.url,
                    });
                    logger.info('DEEPLINK', '[MainScreen] WebView load started', {
                        url: event.nativeEvent.url,
                        routeParams: route.params,
                    });
                }}
                onLoadEnd={event => {
                    updateWebViewState({
                        isLoading: false,
                        currentUrl: event.nativeEvent.url,
                        lastLoadEndUrl: event.nativeEvent.url,
                    });
                    logger.info('DEEPLINK', '[MainScreen] WebView load ended', {
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
                    logger.info('DEEPLINK', '[MainScreen] WebView navigation state changed', {
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

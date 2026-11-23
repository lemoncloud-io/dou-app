import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WebView } from 'react-native-webview';
import { View } from 'react-native';
import type { WebAppReadyPayload } from '@chatic/bridge-messages';

import { useWebViewNavigation } from '../../../webview/hooks/useWebViewNavigation';
import { useDeepLinkNavigation } from '../../../webview/hooks/useDeepLinkNavigation';
import { AppWebView } from '../../../webview';
import { DeepLinkErrorView, WebViewErrorView, type WebViewErrorKind } from '../../core/components';
import type { CrashRecoveryGiveUpReason } from '../../../webview/hooks/useWebViewCrashRecovery';
import type { MainScreenProps } from '../navigation';
import { useAppBridge } from '../../../webview/hooks';
import { bootMetricsService, bootSplashService, logger, subWebViewService } from '../../../services';
import { appRestart } from '../../../services/appRestart';
import { homeAddress } from '../../../webview/utils/homeAddress';
import { useResolvedTheme } from '../../../hooks';
import { useDebugRuntimeStore, useDebugSettingsStore } from '../../../stores';
import { useCustomZipBootGate } from '../../../customZip';

export const MainScreen = ({ route }: MainScreenProps) => {
    const webViewRef = useRef<WebView>(null);
    const updateWebViewState = useDebugRuntimeStore(state => state.updateWebViewState);

    const handleAppReady = useCallback((payload: WebAppReadyPayload) => {
        logger.debug('WEBVIEW', 'WebAppReady received in MainScreen');
        bootMetricsService.mark('web-app-ready');
        bootSplashService.onWebAppReady(payload);
        subWebViewService.resetForNewHost();
    }, []);

    const { bridge, onMessage } = useAppBridge(webViewRef, handleAppReady);
    const { backgroundColor } = useResolvedTheme();
    const webViewBaseUrl = useDebugSettingsStore(state => state.getResolvedWebviewBaseUrl());
    const webViewReloadToken = useDebugRuntimeStore(state => state.webViewReloadToken);
    const requestWebViewReload = useDebugRuntimeStore(state => state.requestWebViewReload);
    const [webViewError, setWebViewError] = useState<{ kind: WebViewErrorKind; reason: string } | null>(null);
    useEffect(() => {
        setWebViewError(null);
    }, [webViewReloadToken]);

    const handleCrashRecoveryFailed = useCallback((reason: CrashRecoveryGiveUpReason) => {
        setWebViewError({ kind: 'crash', reason });
        bootSplashService.onLoadFailed();
    }, []);

    const { isRestoringCustomZip } = useCustomZipBootGate();

    const restartNote = appRestart.note();
    useEffect(() => {
        if (restartNote) bootMetricsService.markRestart();
    }, [restartNote]);

    const { setNavCanGoBack, forgetPageReport } = useWebViewNavigation(bridge);
    const { deepLinkError, deepLinkErrorReason, handleDismissError } = useDeepLinkNavigation(bridge, {
        skipColdStart: restartNote !== null,
    });

    const homeSearchRef = useRef(restartNote?.homeSearch ?? null);

    const webViewSource = useMemo(
        () => ({ uri: homeAddress(webViewBaseUrl, homeSearchRef.current) }),
        [webViewBaseUrl, webViewReloadToken, deepLinkError, webViewError]
    );

    useEffect(() => {
        if (deepLinkError) bootSplashService.onLoadFailed();
    }, [deepLinkError]);

    useEffect(() => {
        if (!webViewError && !deepLinkError) return;
        forgetPageReport();
        setNavCanGoBack(false);
    }, [webViewError, deepLinkError, forgetPageReport, setNavCanGoBack]);

    useEffect(() => {
        bootMetricsService.mark('main-screen-mount');
    }, []);

    if (!webViewBaseUrl || isRestoringCustomZip) {
        return <View style={{ flex: 1, backgroundColor }} />;
    }

    if (deepLinkError) {
        return <DeepLinkErrorView onGoHome={handleDismissError} reason={deepLinkErrorReason} />;
    }

    if (webViewError) {
        return (
            <WebViewErrorView kind={webViewError.kind} reason={webViewError.reason} onRetry={requestWebViewReload} />
        );
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
                    homeSearchRef.current = null;
                    if (event.nativeEvent.loading) forgetPageReport();
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
                    setWebViewError({ kind: 'load', reason: event.nativeEvent.description });
                    bootSplashService.onLoadFailed();
                }}
                onCrashRecoveryFailed={handleCrashRecoveryFailed}
            />
        </View>
    );
};

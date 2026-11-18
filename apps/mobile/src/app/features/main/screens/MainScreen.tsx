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

    // Nothing native covers the WebView while it boots: the launch splash (native) stays up until the
    // web reports its first screen, and the web keeps its own cover until then, so there is no
    // window in which this screen has to hide a half-loaded page. The handshake only matters for an
    // older web build, which never reports a first screen and is revealed on the handshake instead.
    const handleAppReady = useCallback((payload: WebAppReadyPayload) => {
        logger.debug('WEBVIEW', 'WebAppReady received in MainScreen');
        bootMetricsService.mark('web-app-ready');
        bootSplashService.onWebAppReady(payload);
        // A handshake after the first is a web that reloaded: a sub WebView the old page opened has
        // no one left to report its close to.
        subWebViewService.resetForNewHost();
    }, []);

    const { bridge, onMessage } = useAppBridge(webViewRef, handleAppReady);
    const { backgroundColor } = useResolvedTheme();
    const webViewBaseUrl = useDebugSettingsStore(state => state.getResolvedWebviewBaseUrl());
    const webViewReloadToken = useDebugRuntimeStore(state => state.webViewReloadToken);
    const requestWebViewReload = useDebugRuntimeStore(state => state.requestWebViewReload);
    // A failed page load used to leave the mounted WebView blank: the splash lifted,
    // the debug store recorded the error, and the reader stared at nothing with no retry. A WebView
    // whose content process will not stay up ends here too, as a `crash`.
    const [webViewError, setWebViewError] = useState<{ kind: WebViewErrorKind; reason: string } | null>(null);
    // The reload remounts the WebView by key, so the error clears with the retry itself.
    useEffect(() => {
        setWebViewError(null);
    }, [webViewReloadToken]);

    // The error view replaces the WebView; the splash may still be up if the page never got as far as
    // a first screen, so lift it with the same signal as a failed load.
    const handleCrashRecoveryFailed = useCallback((reason: CrashRecoveryGiveUpReason) => {
        setWebViewError({ kind: 'crash', reason });
        bootSplashService.onLoadFailed();
    }, []);

    // Custom zip restore gate: if a persisted localRoot exists, hold off mounting the WebView until
    // the local server comes up (loading localhost before the server starts means a blank screen —
    // customZipServerUrl is only set after the server has started).
    const { isRestoringCustomZip } = useCustomZipBootGate();

    // Set only when the app started this JS context over itself — after a session its runtime held
    // ended, or after the session owner was switched. Read once per context.
    const restartNote = appRestart.note();

    const { setNavCanGoBack } = useWebViewNavigation(bridge);
    // Single owner of inbound navigation: OS deep links, invite links, and notification taps → OnNavigate.
    const { deepLinkError, deepLinkErrorReason, handleDismissError } = useDeepLinkNavigation(bridge, {
        skipColdStart: restartNote !== null,
    });

    // After a session's end the first page load carries the query the page would have gone home with
    // (`logout=1…`), so the page boots as one that has just signed out. The first load only: a page
    // booted with it empties the vault, so a later mount must not repeat it over a session signed in
    // since. It is dropped when that load starts.
    const homeSearchRef = useRef(restartNote?.homeSearch ?? null);

    // source is not frozen at mount time — it's derived from the resolved base URL, so that
    // toggling the custom zip on/off is reflected when the origin changes; reloading happens via a
    // reloadToken key remount. It is worked out again for every new mount — a new base, a reload, the
    // WebView back after an error view replaced it — and only then, so dropping the home query never
    // changes the source under a mounted WebView, which would navigate it.
    const webViewSource = useMemo(
        () => ({ uri: homeAddress(webViewBaseUrl, homeSearchRef.current) }),
        [webViewBaseUrl, webViewReloadToken, deepLinkError, webViewError]
    );

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

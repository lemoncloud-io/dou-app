import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

import { HapticBridge } from '../bridge';
import { useResolvedTheme } from '../hooks';
import { clipboardService, logger, subWebViewService } from '../services';
import { resolveAppLanguage, useLanguageStore } from '../stores';
import { getAppLanguage } from '../utils/device';
import { originOf } from '../utils/url';
import { createSubBridgeHost } from './createSubBridgeHost';
import { createSubBridgeHandlers } from './subBridgeHandlers';
import { buildSubWebViewContextScript } from './subWebViewContextScript';
import { decideSubWebViewNavigation } from './subWebViewNavigation';
import { useSubWebViewBack } from './useSubWebViewBack';

interface SubWebViewProps {
    viewId: string;
    url: string;
    params: Record<string, unknown>;
    onRequestClose: () => void;
    /** The document's own title, each time it changes. */
    onTitleChange?: (title: string) => void;
    /** A title the page asked for with `SetSubWebViewTitle`; `undefined` when a new page starts loading. */
    onTitleRequest?: (title: string | undefined) => void;
}

const openExternal = (url: string) => Linking.openURL(url);

/**
 * The second WebView. Built apart from `AppWebView` on purpose: it gets none of the main WebView's
 * injected globals (device and install ids, the bridge handler) and none of its handlers. Its bridge
 * is a host of its own that answers only the subset a page may use, and only for the origin the view
 * was opened on. Camera, microphone and file pickers are left to the OS and the WebView's own
 * defaults: what may run here is decided by what is allowed to be deployed to the allowlisted
 * domains, not by switching features off.
 */
export const SubWebView = ({ viewId, url, params, onRequestClose, onTitleChange, onTitleRequest }: SubWebViewProps) => {
    const webViewRef = useRef<WebView>(null);
    const [canGoBack, setCanGoBack] = useState(false);
    // One host per page load: a host stays "ready" after its page's first message, so a reloaded
    // page would get pushes before it listens. A new host buffers them until the new page's handshake.
    const [pageLoad, setPageLoad] = useState(0);
    const { backgroundColor, resolvedTheme } = useResolvedTheme();
    const languagePreference = useLanguageStore(state => state.preference);
    const locale = resolveAppLanguage(languagePreference, getAppLanguage());

    const onTitleRequestRef = useRef(onTitleRequest);
    onTitleRequestRef.current = onTitleRequest;

    useSubWebViewBack(webViewRef, canGoBack, onRequestClose);

    const openedOrigin = useMemo(() => originOf(url), [url]);

    const host = useMemo(
        () =>
            createSubBridgeHost(
                message => webViewRef.current?.postMessage(message),
                createSubBridgeHandlers({
                    viewId,
                    service: subWebViewService,
                    clipboard: clipboardService,
                    haptic: HapticBridge,
                    openExternal,
                    setTitle: title => onTitleRequestRef.current?.(title),
                })
            ),
        // `pageLoad` only rebuilds the host; it is not read inside.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [viewId, pageLoad]
    );

    const contextScript = useMemo(
        () =>
            buildSubWebViewContextScript(
                {
                    protocolVersion: 1,
                    viewId,
                    platform: Platform.OS === 'ios' ? 'ios' : 'android',
                    appVersion: DeviceInfo.getVersion(),
                    locale,
                    theme: resolvedTheme,
                    params,
                },
                url
            ),
        [viewId, url, params, locale, resolvedTheme]
    );

    // The page read the context once; a change after that arrives as an event. The host holds it
    // until the page's handshake, so a page still loading misses nothing.
    const announcedContext = useRef({ locale, theme: resolvedTheme });
    useEffect(() => {
        const previous = announcedContext.current;
        if (previous.locale === locale && previous.theme === resolvedTheme) return;
        announcedContext.current = { locale, theme: resolvedTheme };
        host.pushEvent({ type: 'OnSubWebViewContextChanged', success: true, data: { locale, theme: resolvedTheme } });
    }, [host, locale, resolvedTheme]);

    // Only the origin the view was opened on may talk to the app. A page it navigated to — another
    // allowlisted one included — and any frame on another origin get no answer at all.
    const onMessage = useCallback(
        (event: WebViewMessageEvent) => {
            if (originOf(event.nativeEvent.url) !== openedOrigin) {
                logger.warn('WEBVIEW', '[sub] message dropped: not the opened origin', { url: event.nativeEvent.url });
                return;
            }
            void host.handleMessage(event.nativeEvent.data);
        },
        [host, openedOrigin]
    );

    const onShouldStartLoadWithRequest = useCallback((request: ShouldStartLoadRequest) => {
        const decision = decideSubWebViewNavigation(request);
        if (decision === 'external') {
            Linking.openURL(request.url).catch(e => logger.warn('WEBVIEW', '[sub] external open failed', e));
        } else if (decision === 'block') {
            logger.warn('WEBVIEW', '[sub] navigation blocked', { url: request.url });
        }
        return decision === 'load';
    }, []);

    // A new document: a fresh host for it, and the last page's own title no longer applies.
    const onLoadStart = useCallback(() => {
        setPageLoad(count => count + 1);
        onTitleRequestRef.current?.(undefined);
    }, []);

    const onNavigationStateChange = useCallback(
        (state: WebViewNavigation) => {
            setCanGoBack(state.canGoBack);
            if (state.title && !state.loading) onTitleChange?.(state.title);
        },
        [onTitleChange]
    );

    return (
        <WebView
            ref={webViewRef}
            source={{ uri: url }}
            style={[styles.webView, { backgroundColor }]}
            injectedJavaScriptBeforeContentLoaded={contextScript}
            // Again at load end: on Android the first run does not always precede the page's own
            // scripts. The script stops when it finds the context already defined.
            injectedJavaScript={contextScript}
            onLoadStart={onLoadStart}
            onMessage={onMessage}
            // Everything, so every navigation reaches the decision below: react-native-webview checks
            // this list first and hands whatever fails it straight to the OS, the app's own schemes
            // included, without asking `onShouldStartLoadWithRequest`.
            originWhitelist={['*']}
            // Inspectable from Safari Web Inspector and `chrome://inspect` in a development build,
            // as the main WebView is; iOS 16.4+ shows no WebView there without it.
            webviewDebuggingEnabled={__DEV__}
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
            onNavigationStateChange={onNavigationStateChange}
            // `target=_blank` and `window.open` load in this view, through the same check, instead
            // of opening a window this screen does not manage.
            setSupportMultipleWindows={false}
            allowsBackForwardNavigationGestures
        />
    );
};

const styles = StyleSheet.create({
    webView: { flex: 1 },
});

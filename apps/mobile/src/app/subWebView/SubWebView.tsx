import React, { useCallback, useRef, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

import { useResolvedTheme } from '../hooks';
import { logger } from '../services';
import { decideSubWebViewNavigation } from './subWebViewNavigation';
import { useSubWebViewBack } from './useSubWebViewBack';

interface SubWebViewProps {
    url: string;
    onRequestClose: () => void;
    /** The page's own title, each time it changes. */
    onTitleChange?: (title: string) => void;
}

/**
 * The second WebView. Built apart from `AppWebView` on purpose: it gets none of the main WebView's
 * injected globals (device and install ids, the bridge handler) and no `onMessage`, so
 * react-native-webview does not inject `window.ReactNativeWebView` either — the page has no channel
 * to the app at all. Camera, microphone and file pickers are left to the OS and the WebView's own
 * defaults: what may run here is decided by what is allowed to be deployed to the allowlisted
 * domains, not by switching features off.
 */
export const SubWebView = ({ url, onRequestClose, onTitleChange }: SubWebViewProps) => {
    const webViewRef = useRef<WebView>(null);
    const [canGoBack, setCanGoBack] = useState(false);
    const { backgroundColor } = useResolvedTheme();

    useSubWebViewBack(webViewRef, canGoBack, onRequestClose);

    const onShouldStartLoadWithRequest = useCallback((request: ShouldStartLoadRequest) => {
        const decision = decideSubWebViewNavigation(request);
        if (decision === 'external') {
            Linking.openURL(request.url).catch(e => logger.warn('WEBVIEW', '[sub] external open failed', e));
        } else if (decision === 'block') {
            logger.warn('WEBVIEW', '[sub] navigation blocked', { url: request.url });
        }
        return decision === 'load';
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
            // Everything, so every navigation reaches the decision below: react-native-webview checks
            // this list first and hands whatever fails it straight to the OS, the app's own schemes
            // included, without asking `onShouldStartLoadWithRequest`.
            originWhitelist={['*']}
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

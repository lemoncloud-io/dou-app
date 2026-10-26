import { useCallback, useEffect, type RefObject } from 'react';
import type WebView from 'react-native-webview';

import { getFoldScript } from '../utils/injectionScripts';
import type { WebViewFold } from '../utils/webViewGeometry';

/**
 * Keeps the page's device fold current. Pushed live on every change, since folding the display
 * reloads nothing. Returns a callback for the WebView's `onLoad` that sends the latest value again.
 *
 * The replay is needed because the first value arrives over the bridge after the WebView has been
 * created, often while its page is still loading. A push into a loading page is lost, and the boot
 * script only carries the value into the next load. So an app opened on a half-open device would
 * otherwise keep its tab bar across the fold until the posture next changed.
 */
export const useFoldInjection = (
    webViewRef: RefObject<Pick<WebView, 'injectJavaScript'> | null>,
    fold: WebViewFold | null
): (() => void) => {
    const inject = useCallback(() => {
        webViewRef.current?.injectJavaScript(getFoldScript(fold));
    }, [webViewRef, fold]);

    useEffect(inject, [inject]);

    return inject;
};

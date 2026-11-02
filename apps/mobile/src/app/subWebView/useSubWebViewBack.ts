import { type RefObject, useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';
import type { WebView } from 'react-native-webview';

/**
 * Android back while the sub WebView shows: the page's own history first, then close. Always
 * consumes the press, so it never reaches the main WebView underneath.
 */
export const useSubWebViewBack = (
    webViewRef: RefObject<WebView | null>,
    canGoBack: boolean,
    onRequestClose: () => void
) => {
    useEffect(() => {
        if (Platform.OS !== 'android') return;
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            if (canGoBack) webViewRef.current?.goBack();
            else onRequestClose();
            return true;
        });
        return () => subscription.remove();
    }, [webViewRef, canGoBack, onRequestClose]);
};

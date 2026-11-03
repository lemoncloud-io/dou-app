import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * What an Android back press does while the sub WebView shows, in order: the page's own claim
 * (`SetCanGoBack`), then the view's history, then closing the view.
 */
export const decideSubWebViewBack = (state: { claimed: boolean; canGoBack: boolean }): 'page' | 'history' | 'close' => {
    if (state.claimed) return 'page';
    if (state.canGoBack) return 'history';
    return 'close';
};

/**
 * Android back while the sub WebView shows. Always consumes the press, so it never reaches the main
 * WebView underneath; what the press does is `onBack`'s call.
 */
export const useSubWebViewBack = (onBack: () => void) => {
    useEffect(() => {
        if (Platform.OS !== 'android') return;
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            onBack();
            return true;
        });
        return () => subscription.remove();
    }, [onBack]);
};

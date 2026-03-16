import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

import { postAppMessage } from '../core/bridge';

import type React from 'react';
import type { WebView } from 'react-native-webview';

export const useAndroidBack = (webViewRef: React.RefObject<WebView | null>, canGoBack: boolean) => {
    useEffect(() => {
        if (Platform.OS !== 'android') return;

        const onBackPress = () => {
            if (webViewRef.current) {
                // Send back pressed message to web for handling modals/dialogs and navigation
                // Web handles: 1) Close dialog if open, 2) Otherwise navigate(-1)
                postAppMessage(webViewRef, { type: 'OnBackPressed' });

                // Consume event if web can handle navigation (prevent app exit)
                if (canGoBack) {
                    return true;
                }
            }
            return false;
        };

        const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => subscription.remove();
    }, [canGoBack, webViewRef]);
};

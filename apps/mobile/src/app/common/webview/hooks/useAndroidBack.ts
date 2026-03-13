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
                // Send back pressed message to web for handling modals/dialogs
                postAppMessage(webViewRef, { type: 'OnBackPressed' });

                // If web can handle navigation, let it decide
                if (canGoBack) {
                    webViewRef.current.goBack();
                    return true;
                }
            }
            return false;
        };

        const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => subscription.remove();
    }, [canGoBack, webViewRef]);
};

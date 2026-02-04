import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

import type React from 'react';
import type { WebView } from 'react-native-webview';

export const useAndroidBack = (webViewRef: React.RefObject<WebView | null>, canGoBack: boolean) => {
    useEffect(() => {
        if (Platform.OS !== 'android') return;

        const onBackPress = () => {
            if (canGoBack && webViewRef.current) {
                webViewRef.current.goBack();
                return true;
            }
            return false;
        };

        const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => subscription.remove();
    }, [canGoBack, webViewRef]);
};

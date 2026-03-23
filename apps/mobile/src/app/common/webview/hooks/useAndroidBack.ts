import type React from 'react';
import { useEffect } from 'react';
import { Alert, BackHandler, Platform } from 'react-native';

import { t } from '../../i18n';
import { postAppMessage } from '../core';
import { useLanguageStore } from '../../stores';
import type { WebView } from 'react-native-webview';

export const useAndroidBack = (webViewRef: React.RefObject<WebView | null>, canGoBack: boolean) => {
    const language = useLanguageStore(state => state.language);

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

            // At root - show exit confirmation with synced language from web
            Alert.alert(
                t('app.exitDialog.title', language),
                t('app.exitDialog.message', language),
                [
                    { text: t('app.exitDialog.cancel', language), style: 'cancel' },
                    { text: t('app.exitDialog.confirm', language), onPress: () => BackHandler.exitApp() },
                ],
                { cancelable: true }
            );

            // Consume event to prevent immediate exit
            return true;
        };

        const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => subscription.remove();
    }, [canGoBack, language, webViewRef]);
};

import { useEffect } from 'react';
import { Alert, BackHandler, Platform } from 'react-native';
import { useLanguageStore } from '../../stores';
import { t } from '../../utils';
import type { IAppBridgeHost } from '@chatic/bridges';

export const useAndroidBack = (bridge: IAppBridgeHost, canGoBack: boolean) => {
    const language = useLanguageStore(state => state.language);

    useEffect(() => {
        if (Platform.OS !== 'android') return;

        const onBackPress = () => {
            if (bridge) {
                // Send back pressed message to web for handling modals/dialogs and navigation
                // Web handles: 1) Close dialog if open, 2) Otherwise navigate(-1)
                bridge.pushEvent<`OnBackPressed`>({
                    type: 'OnBackPressed',
                    success: true,
                    data: {},
                });
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
    }, [bridge, canGoBack, language]);
};

import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';
import type { IAppBridgeHost } from '@chatic/bridges';

export const useAndroidBack = (bridge: IAppBridgeHost, canGoBack: boolean) => {
    useEffect(() => {
        if (Platform.OS !== 'android') return;

        const onBackPress = () => {
            if (bridge && canGoBack) {
                // Send back pressed message to web for handling modals/dialogs and navigation
                // Web handles: 1) Close dialog if open, 2) Otherwise navigate(-1)
                bridge.pushEvent<`OnBackPressed`>({
                    type: 'OnBackPressed',
                    success: true,
                    data: {},
                });
                return true;
            }

            return false;
        };

        const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => subscription.remove();
    }, [bridge, canGoBack]);
};

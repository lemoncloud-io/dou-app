import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';
import type { IAppBridgeHost } from '@chatic/bridges';
import { subWebViewService } from '../../services';

export const useAndroidBack = (bridge: IAppBridgeHost, canGoBack: boolean) => {
    useEffect(() => {
        if (Platform.OS !== 'android') return;

        const onBackPress = () => {
            // The sub WebView's own handler takes back while it shows. Listeners run newest first, and
            // this one is re-added whenever `canGoBack` changes, so it can end up above that one.
            if (subWebViewService.current()) return false;
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

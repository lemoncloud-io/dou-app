import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';
import type { IAppBridgeHost } from '@chatic/bridges';
import { subWebViewService } from '../../services';

export const useAndroidBack = (bridge: IAppBridgeHost, canGoBack: boolean) => {
    useEffect(() => {
        if (Platform.OS !== 'android') return;

        const onBackPress = () => {
            if (subWebViewService.current()) return false;
            if (bridge && canGoBack) {
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

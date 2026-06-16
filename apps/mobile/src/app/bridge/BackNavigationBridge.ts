import { NativeModules, Platform } from 'react-native';

const { BackNavigation } = NativeModules;

export const BackNavigationBridge = {
    setCanGoBack: (canGoBack: boolean): void => {
        if (Platform.OS !== 'android') return;

        if (!BackNavigation) {
            console.warn('BackNavigation native module is not registered.');
            return;
        }

        BackNavigation.setCanGoBack(canGoBack);
    },
};

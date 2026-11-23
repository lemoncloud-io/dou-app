import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

export const decideSubWebViewBack = (state: { claimed: boolean; canGoBack: boolean }): 'page' | 'history' | 'close' => {
    if (state.claimed) return 'page';
    if (state.canGoBack) return 'history';
    return 'close';
};

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

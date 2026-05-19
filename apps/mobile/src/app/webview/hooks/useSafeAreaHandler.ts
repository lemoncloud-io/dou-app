import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { OnFetchSafeAreaPayload } from '@chatic/app-messages';

export const useSafeAreaHandler = () => {
    const insets = useSafeAreaInsets();

    const fetchSafeAreaInfo = useCallback((): OnFetchSafeAreaPayload => {
        return {
            top: insets.top,
            bottom: insets.bottom,
            left: insets.left,
            right: insets.right,
        };
    }, [insets]);

    return { fetchSafeAreaInfo };
};

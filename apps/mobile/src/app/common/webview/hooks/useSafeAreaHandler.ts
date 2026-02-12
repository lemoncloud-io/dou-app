import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { WebViewBridge } from '../index';
import type { AppMessageData } from '@chatic/app-messages';

export const useSafeAreaHandler = (bridge: WebViewBridge) => {
    const insets = useSafeAreaInsets();

    const getSafeAreaInfo = useCallback(() => {
        const safeAreaMessage: AppMessageData<'OnUpdateSafeArea'> = {
            type: 'OnUpdateSafeArea',
            data: {
                top: insets.top,
                bottom: insets.bottom,
                left: insets.left,
                right: insets.right,
            },
        };
        bridge.post(safeAreaMessage);
    }, [bridge, insets]);

    return { getSafeAreaInfo };
};

import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WebMessageData } from '@chatic/app-messages';

export const useSafeAreaHandler = () => {
    const insets = useSafeAreaInsets();

    const fetchSafeAreaInfo = useCallback(
        async (_message: WebMessageData<'FetchSafeArea'>) => {
            return {
                type: 'OnFetchSafeArea' as const,
                success: true,
                data: {
                    top: insets.top,
                    bottom: insets.bottom,
                    left: insets.left,
                    right: insets.right,
                },
            };
        },
        [insets]
    );

    return { fetchSafeAreaInfo };
};

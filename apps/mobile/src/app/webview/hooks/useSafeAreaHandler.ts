import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WebMessageAppHandler } from '@chatic/app-messages';

export const useSafeAreaHandler = () => {
    const insets = useSafeAreaInsets();

    const fetchSafeAreaInfo = useCallback<WebMessageAppHandler<'FetchSafeArea'>>(
        async _message => {
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

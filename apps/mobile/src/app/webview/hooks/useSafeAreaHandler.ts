import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WebMessageData } from '@chatic/app-messages';

import { toWebViewInsets } from '../utils/webViewGeometry';

export const useSafeAreaHandler = () => {
    const insets = useSafeAreaInsets();

    const fetchSafeAreaInfo = useCallback(
        async (_message: WebMessageData<'FetchSafeArea'>) => {
            // The same web-relative insets the injected CSS variables carry: the shell already pads
            // the WebView horizontally, so left and right are 0 from the web's side.
            const { top, bottom, left, right } = toWebViewInsets(insets).web;
            return {
                type: 'OnFetchSafeArea' as const,
                success: true,
                data: { top, bottom, left, right },
            };
        },
        [insets]
    );

    return { fetchSafeAreaInfo };
};

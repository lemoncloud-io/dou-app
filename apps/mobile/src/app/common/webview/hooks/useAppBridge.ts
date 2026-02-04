import { useEffect } from 'react';

import { Logger } from '../../services';
import { useWebViewBridge } from '../index';

import type { AppLogInfo, AppMessageData } from '@chatic/app-messages';
import type { WebView } from 'react-native-webview';

export const useAppBridge = (webViewRef: React.RefObject<WebView | null>) => {
    const bridge = useWebViewBridge(webViewRef);

    useEffect(() => {
        const unsubscribe = Logger.subscribe((level, tag, message, data, error) => {
            try {
                const logPayload: AppLogInfo = {
                    level: level,
                    tag: tag,
                    message: message,
                    timestamp: Date.now(),
                    data: data,
                    error: error,
                };

                const logMessage: AppMessageData<'AppLog'> = {
                    type: 'AppLog',
                    data: logPayload,
                };
                bridge.post(logMessage);
            } catch (e) {
                if (__DEV__) {
                    const time = new Date().toLocaleTimeString();
                    console.error(`[${time}] [Bridge] Failed to post AppLog`, e);
                }
            }
        });

        return () => {
            unsubscribe();
        };
    }, [bridge]);

    return { bridge };
};

import { useEffect } from 'react';

import { logger } from '../../services';
import { useWebViewBridge } from '../index';

import type { AppLogInfo, AppMessageData } from '@chatic/app-messages';
import type { WebView } from 'react-native-webview';

export const useAppBridge = (webViewRef: React.RefObject<WebView | null>) => {
    const bridge = useWebViewBridge(webViewRef);

    useEffect(() => {
        const unsubscribe = logger.subscribe((level, tag, message, data, error) => {
            try {
                // WebView => App => Webview... 순환호출 방지 코드
                if (tag === 'WEBVIEW') {
                    return;
                }

                const logPayload: AppLogInfo = {
                    level: level,
                    tag: tag,
                    message: message,
                    timestamp: Date.now(),
                    data: data,
                    error: error,
                };

                const logMessage: AppMessageData<'OnAppLog'> = {
                    type: 'OnAppLog',
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

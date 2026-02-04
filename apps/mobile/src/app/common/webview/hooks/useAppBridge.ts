import { useCallback } from 'react';

import { useWebViewBridge } from '../index';

import type { AppErrorInfo, AppLogInfo, AppMessageData } from '@chatic/app-messages';
import type { WebView } from 'react-native-webview';

export const useAppBridge = (webViewRef: React.RefObject<WebView | null>) => {
    const bridge = useWebViewBridge(webViewRef);

    const sendAppLog = useCallback(
        (log: AppLogInfo) => {
            const appLogMessage: AppMessageData<'AppLog'> = {
                type: 'AppLog',
                data: {
                    level: log.level ?? 'info',
                    tag: log.tag,
                    message: log.message,
                    data: log.data,
                    timestamp: log.timestamp ?? Date.now(),
                },
            };
            bridge.post(appLogMessage);
        },
        [bridge]
    );

    const sendAppError = useCallback(
        (error: AppErrorInfo) => {
            const appErrorMessage: AppMessageData<'AppError'> = {
                type: 'AppError',
                data: {
                    tag: error.tag,
                    message: error.message,
                    details: error
                        ? {
                              originalError: error instanceof Error ? error.message : String(error),
                              stack: error instanceof Error ? error.stack : undefined,
                              raw: JSON.stringify(error, Object.getOwnPropertyNames(error)),
                          }
                        : undefined,
                },
            };
            bridge.post(appErrorMessage);
        },
        [bridge]
    );

    return { bridge, sendAppLog, sendAppError };
};

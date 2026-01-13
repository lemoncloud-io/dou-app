import type { AppMessageData, AppMessageType } from '@chatic/app-messages';
import type { RefObject } from 'react';
import type { WebView } from 'react-native-webview';

/**
 * Create a bridge for communication between the App and Web.
 * @param webViewRef If null or unmounted, the message will be ignored.
 */
export const createBridge = (webViewRef: RefObject<WebView | null>) => ({
    /**
     * Dispatches a typed message from the App to the Web.
     * @param message The structured message object following the AppMessageData specification. (see AppMessageData.)
     * @see AppMessageData
     */
    post: <T extends AppMessageType>(message: AppMessageData<T>) => {
        if (!webViewRef.current) return;
        webViewRef.current.postMessage(JSON.stringify(message));
    },
});

/**
 * Dispatches a typed message from the App to the Web.
 * @param webViewRef If null or unmounted, the message will be ignored.
 * @param message The structured message object following the AppMessageData specification. (see AppMessageData.)
 * @see AppMessageData
 */
export const postAppMessage = <T extends AppMessageType>(
    webViewRef: RefObject<WebView | null>,
    message: AppMessageData<T>
) => {
    if (!webViewRef.current) return;
    webViewRef.current.postMessage(JSON.stringify(message));
};

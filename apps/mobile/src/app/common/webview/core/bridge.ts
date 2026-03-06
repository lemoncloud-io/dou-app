import type { AppMessageData, AppMessageType, WebMessageData, WebMessageType } from '@chatic/app-messages';
import type { RefObject } from 'react';
import type { WebView, WebViewMessageEvent } from 'react-native-webview';

/**
 * Create a bridge for communication between the App and Web.
 * @param webViewRef If null or unmounted, the message will be ignored.
 * @author dev@example.com
 */
export const createBridge = (webViewRef: RefObject<WebView | null>) => ({
    /**
     * Dispatches a typed message from the App to the Web.
     * @param message The structured message object following the AppMessageData specification. (see AppMessageData.)
     * @see AppMessageData
     */
    post: <T extends AppMessageType>(message: AppMessageData<T>) => {
        if (!webViewRef.current) return;
        const json = JSON.stringify(message).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        webViewRef.current.injectJavaScript(`window.dispatchEvent(new MessageEvent('message',{data:'${json}'}));true;`);
    },

    /**
     * Handles messages received from the Web.
     * This function is designed to be used with the `onMessage` props of the `WebView`.
     *
     * @param onSuccess Callback function to execute after successful message reception.
     * @param onError Callback function to handle errors occurring during message processing.
     * @see WebMessageData
     */
    receive: (
        onSuccess: (message: WebMessageData<WebMessageType>, nativeEvent: WebViewMessageEvent['nativeEvent']) => void,
        onError: (error: any, nativeEvent: WebViewMessageEvent['nativeEvent']) => void
    ) => {
        return (event: WebViewMessageEvent) => {
            try {
                const { data } = event.nativeEvent;
                const message = JSON.parse(data) as WebMessageData<WebMessageType>;
                onSuccess(message, event.nativeEvent);
            } catch (error) {
                onError(error, event.nativeEvent);
            }
        };
    },
});

/**
 * Dispatches a typed message from the App to the Web.
 * @param webViewRef If null or unmounted, the message will be ignored.
 * @param message The structured message object following the AppMessageData specification. (see AppMessageData.)
 * @see AppMessageData
 * @author dev@example.com
 */
export const postAppMessage = <T extends AppMessageType>(
    webViewRef: RefObject<WebView | null>,
    message: AppMessageData<T>
) => {
    if (!webViewRef.current) return;
    webViewRef.current.postMessage(JSON.stringify(message));
};

/**
 * Handles messages received from the Web.
 * This function is designed to be used with the `onMessage` props of the `WebView`.
 *
 * @param onSuccess Callback function to execute after successful message reception.
 * @param onError Callback function to handle errors occurring during message processing.
 * @see WebMessageData
 * @author dev@example.com
 */
export const receiveWebMessage = <T extends WebMessageType>(
    onSuccess: (message: WebMessageData<T>, nativeEvent: WebViewMessageEvent['nativeEvent']) => void,
    onError: (error: any, nativeEvent: WebViewMessageEvent['nativeEvent']) => void
) => {
    return (event: WebViewMessageEvent) => {
        try {
            const { data } = event.nativeEvent;
            const message = JSON.parse(data) as WebMessageData<T>;
            onSuccess(message, event.nativeEvent);
        } catch (error) {
            onError(error, event.nativeEvent);
        }
    };
};

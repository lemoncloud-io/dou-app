import type { RefObject } from 'react';
import type { WebView, WebViewMessageEvent } from 'react-native-webview';
import type { AppMessageData, AppMessageType, WebMessageData, WebMessageType } from '@chatic/bridge-messages';

export const createBridge = (webViewRef: RefObject<WebView | null>) => ({
    post: <T extends AppMessageType>(message: AppMessageData<T>) => {
        if (!webViewRef.current) return;
        webViewRef.current.postMessage(JSON.stringify(message));
    },

    receive: (
        onSuccess: (message: WebMessageData<WebMessageType>, nativeEvent: WebViewMessageEvent['nativeEvent']) => void,
        onError: (error: any, nativeEvent: WebViewMessageEvent['nativeEvent']) => void
    ) => {
        return (event: WebViewMessageEvent) => {
            try {
                const { data } = event.nativeEvent;
                if (!data) return;
                const message = JSON.parse(data) as WebMessageData<WebMessageType>;
                onSuccess(message, event.nativeEvent);
            } catch (error) {
                onError(error, event.nativeEvent);
            }
        };
    },
});

export const postAppMessage = <T extends AppMessageType>(
    webViewRef: RefObject<WebView | null>,
    message: AppMessageData<T>
) => {
    if (!webViewRef.current) return;
    webViewRef.current.postMessage(JSON.stringify(message));
};

export const receiveWebMessage = <T extends WebMessageType>(
    onSuccess: (message: WebMessageData<T>, nativeEvent: WebViewMessageEvent['nativeEvent']) => void,
    onError: (error: any, nativeEvent: WebViewMessageEvent['nativeEvent']) => void
) => {
    return (event: WebViewMessageEvent) => {
        try {
            const { data } = event.nativeEvent;
            if (!data) return;
            const message = JSON.parse(data) as WebMessageData<T>;
            onSuccess(message, event.nativeEvent);
        } catch (error) {
            onError(error, event.nativeEvent);
        }
    };
};

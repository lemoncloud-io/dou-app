import { type RefObject, useCallback, useMemo } from 'react';

import { createBridge, postAppMessage, receiveWebMessage } from '../core';

import type { AppMessageData, AppMessageType, WebMessageData, WebMessageType } from '@chatic/app-messages';
import type { WebView, WebViewMessageEvent } from 'react-native-webview';

export const useWebViewBridge = (webViewRef: RefObject<WebView | null>) => {
    return useMemo(() => createBridge(webViewRef), [webViewRef]);
};

export const usePostAppMessage = (webViewRef: RefObject<WebView | null>) => {
    return useCallback(
        <T extends AppMessageType>(message: AppMessageData<T>) => {
            postAppMessage(webViewRef, message);
        },
        [webViewRef]
    );
};

export const useReceiveWebMessage = (
    onSuccess: (message: WebMessageData<WebMessageType>, nativeEvent: WebViewMessageEvent['nativeEvent']) => void,
    onError: (error: any, nativeEvent: WebViewMessageEvent['nativeEvent']) => void
) => {
    return useMemo(() => receiveWebMessage(onSuccess, onError), [onSuccess, onError]);
};

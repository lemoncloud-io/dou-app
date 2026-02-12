import React, { useMemo, useRef, useState } from 'react';
import Config from 'react-native-config';

import { AppWebView, Logger } from '../../../common';
import { FullScreenLoader } from '../../../common';
import {
    useAndroidBack,
    useAppBridge,
    useFcmHandler,
    useSafeAreaHandler,
    useSubscriptionIapHandler,
} from '../../../common/webview/hooks';

import type { WebMessageData, WebMessageType } from '@chatic/app-messages';
import type { WebView, WebViewMessageEvent } from 'react-native-webview';
import type { WebViewMessage } from 'react-native-webview/lib/WebViewTypes';

const webviewUrl = Config.VITE_WEBVIEW_BASE_URL ?? '';

export const MainScreen = () => {
    const webViewRef = useRef<WebView>(null);
    const [canGoBack, setCanGoBack] = useState(false);

    const { bridge } = useAppBridge(webViewRef);
    const { getSafeAreaInfo } = useSafeAreaHandler(bridge);
    const { getFcmToken } = useFcmHandler(bridge);
    const { getProducts, getCurrentPurchases, checkPurchases, purchaseSubscription, isIapLoading } =
        useSubscriptionIapHandler(bridge);

    useAndroidBack(webViewRef, canGoBack);

    /**
     * //TODO: Not Implement
     * @author dev@example.com
     */
    const handleMessage: (event: WebViewMessageEvent) => void = useMemo(() => {
        return bridge.receive(
            (message: WebMessageData<WebMessageType>) => {
                switch (message.type) {
                    case 'GetFcmToken': {
                        void getFcmToken();
                        break;
                    }
                    case 'GetSafeArea': {
                        getSafeAreaInfo();
                        break;
                    }
                    case 'CheckUnfinishedPurchases': {
                        void checkPurchases();
                        break;
                    }

                    case 'GetProducts': {
                        void getProducts();
                        break;
                    }

                    case 'GetCurrentPurchases': {
                        void getCurrentPurchases();
                        break;
                    }

                    case 'PurchaseSubscription': {
                        void purchaseSubscription(message.data.sku);
                        break;
                    }

                    default:
                        Logger.error('BRIDGE', `Failed received error. : ${message.type}`);
                }
            },
            (error: any, nativeEvent: WebViewMessage) => {
                Logger.error('BRIDGE', `Failed parse message error. : ${nativeEvent.data}`, error);
            }
        );
    }, [bridge, checkPurchases, getCurrentPurchases, getFcmToken, getProducts, getSafeAreaInfo, purchaseSubscription]);

    return (
        <>
            <AppWebView
                ref={webViewRef}
                source={{ uri: webviewUrl }}
                onMessage={handleMessage}
                onNavigationStateChange={navState => {
                    setCanGoBack(navState.canGoBack);
                }}
            />
            <FullScreenLoader visible={isIapLoading} message="결제 처리 중..." />
        </>
    );
};

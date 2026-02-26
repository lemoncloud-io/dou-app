import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import Config from 'react-native-config';

import { useIsFocused } from '@react-navigation/native';

import { AppWebView, FullScreenLoader, Logger, useDeepLinkStore } from '../../../common';
import {
    useAndroidBack,
    useAppBridge,
    useFcmHandler,
    useSafeAreaHandler,
    useSubscriptionIapHandler,
} from '../../../common/webview/hooks';

import type { AppMessageData, WebMessageData, WebMessageType } from '@chatic/app-messages';
import type { WebView, WebViewMessageEvent } from 'react-native-webview';
import type { WebViewMessage } from 'react-native-webview/lib/WebViewTypes';
import type { MainScreenProps } from '../navigation';
import { useIsFocused } from '@react-navigation/native';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

const webviewUrl = Config.VITE_WEBVIEW_BASE_URL ?? 'http://localhost:5003';

export const MainScreen = ({ navigation }: MainScreenProps) => {
    const webViewRef = useRef<WebView>(null);
    const isFocused = useIsFocused();
    const isModalOpened = useRef(false);
    const [canGoBack, setCanGoBack] = useState(false);
    const [isWebViewLoaded, setIsWebViewLoaded] = useState(false);

    // Deep Link Store
    const { pendingUrl, clearPendingUrl, setWebViewReady } = useDeepLinkStore();

    const { bridge } = useAppBridge(webViewRef);
    const { getSafeAreaInfo } = useSafeAreaHandler(bridge);
    const { getFcmToken } = useFcmHandler(bridge);
    const { getProducts, getCurrentPurchases, checkPurchases, purchaseSubscription, isIapLoading } =
        useSubscriptionIapHandler(bridge);

    useAndroidBack(webViewRef, canGoBack);

    // Handle WebView load complete
    const handleWebViewLoad = useCallback(() => {
        Logger.info('WEBVIEW', 'WebView loaded');
        setIsWebViewLoaded(true);
        setWebViewReady(true);
    }, [setWebViewReady]);

    // Handle pending deep link URL
    useEffect(() => {
        if (pendingUrl && isWebViewLoaded && webViewRef.current) {
            Logger.info('DEEPLINK', `Loading deep link URL: ${pendingUrl}`);
            // Escape URL to prevent XSS injection
            const safeUrl = encodeURI(pendingUrl).replace(/'/g, '%27');
            webViewRef.current.injectJavaScript(`
                window.location.href = '${safeUrl}';
                true;
            `);
            clearPendingUrl();
        }
    }, [pendingUrl, isWebViewLoaded, clearPendingUrl]);

    useEffect(() => {
        if (isFocused && isModalOpened.current) {
            const message: AppMessageData<'OnCloseModal'> = { type: 'OnCloseModal' };
            bridge.post(message);
            isModalOpened.current = false;
        }
    }, [isFocused, bridge]);

    /**
     * //TODO: Not Implement
     * @author raine@lemoncloud.io
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

                    case 'OpenModal': {
                        isModalOpened.current = true;
                        const { url, type = 'sheet', heightRatio, dragHandle } = message.data;
                        if (type === 'full') {
                            navigation.navigate('Modal', { url, type: 'full', heightRatio, dragHandle });
                        } else {
                            navigation.navigate('Modal', { url, type: 'sheet', heightRatio, dragHandle });
                        }
                        break;
                    }
                    case 'CloseModal': {
                        if (navigation.canGoBack()) {
                            navigation.goBack();
                        }
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
    }, [
        bridge,
        checkPurchases,
        getCurrentPurchases,
        getFcmToken,
        getProducts,
        getSafeAreaInfo,
        navigation,
        purchaseSubscription,
    ]);

    return (
        <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <AppWebView
                    ref={webViewRef}
                    source={{ uri: webviewUrl }}
                    scrollEnabled={false}
                    onMessage={handleMessage}
                    onLoad={handleWebViewLoad}
                    onNavigationStateChange={navState => {
                        setCanGoBack(navState.canGoBack);
                    }}
                />
            </KeyboardAvoidingView>
            <FullScreenLoader visible={isIapLoading} message="결제 처리 중..." />
        </View>
    );
};

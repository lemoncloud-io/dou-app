import React, { useEffect, useMemo, useRef, useState } from 'react';
import Config from 'react-native-config';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppWebView, FullScreenLoader, Logger } from '../../../common';
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
import { KeyboardAvoidingView, Platform } from 'react-native';

const webviewUrl = Config.VITE_WEBVIEW_BASE_URL ?? 'http://chatic-front-web.s3-website.ap-northeast-2.amazonaws.com';

export const MainScreen = ({ navigation }: MainScreenProps) => {
    const webViewRef = useRef<WebView>(null);
    const isFocused = useIsFocused();
    const isModalOpened = useRef(false);
    const [canGoBack, setCanGoBack] = useState(false);

    const { bridge } = useAppBridge(webViewRef);
    const { getSafeAreaInfo } = useSafeAreaHandler(bridge);
    const { getFcmToken } = useFcmHandler(bridge);
    const { getProducts, getCurrentPurchases, checkPurchases, purchaseSubscription, isIapLoading } =
        useSubscriptionIapHandler(bridge);

    useAndroidBack(webViewRef, canGoBack);

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
        <>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }} edges={['top', 'bottom']}>
                    <AppWebView
                        ref={webViewRef}
                        source={{ uri: webviewUrl }}
                        onMessage={handleMessage}
                        onNavigationStateChange={navState => {
                            setCanGoBack(navState.canGoBack);
                        }}
                    />
                </SafeAreaView>
            </KeyboardAvoidingView>
            <FullScreenLoader visible={isIapLoading} message="결제 처리 중..." />
        </>
    );
};

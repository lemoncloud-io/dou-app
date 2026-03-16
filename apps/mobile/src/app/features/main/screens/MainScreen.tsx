import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppWebView, FullScreenLoader, getAppLanguage, Logger, useDeepLinkStore } from '../../../common';
import {
    useAndroidBack,
    useAppBridge,
    useCacheHandler,
    useDeviceHandler,
    useFcmHandler,
    useOAuthHandler,
    usePermissionHandler,
    useSafeAreaHandler,
    useSubscriptionIapHandler,
} from '../../../common/webview/hooks';

import type { AppMessageData, WebMessageData, WebMessageType } from '@chatic/app-messages';
import type { WebView, WebViewMessageEvent } from 'react-native-webview';
import type { WebViewMessage } from 'react-native-webview/lib/WebViewTypes';
import type { MainScreenProps } from '../navigation';
import { useIsFocused } from '@react-navigation/native';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import Config from 'react-native-config';

// TODO: Use Config.VITE_WEBVIEW_BASE_URL when ready for production
const webviewUrl = Config.VITE_WEBVIEW_BASE_URL ?? 'http://localhost:5003';
// const webviewUrl = 'http://localhost:5003';

export const MainScreen = ({ navigation }: MainScreenProps) => {
    const webViewRef = useRef<WebView>(null);
    const isFocused = useIsFocused();
    const isModalOpened = useRef(false);
    const [webCanGoBack, setWebCanGoBack] = useState(false); // Web has dialogs to close
    const [navCanGoBack, setNavCanGoBack] = useState(false); // WebView has navigation history
    const canGoBack = webCanGoBack || navCanGoBack; // Either can handle back button
    const [language, setLanguage] = useState(getAppLanguage());
    const [isWebViewLoaded, setIsWebViewLoaded] = useState(false);

    // Deep Link Store
    const { pendingUrl, pendingEnvs, clearPendingUrl, setWebViewReady } = useDeepLinkStore();

    const { bridge } = useAppBridge(webViewRef);
    const { fetchSafeAreaInfo } = useSafeAreaHandler(bridge);
    const { fetchFcmToken } = useFcmHandler(bridge);
    const { fetchProducts, fetchCurrentPurchases, restorePurchase, purchaseSubscription, isIapLoading } =
        useSubscriptionIapHandler(bridge);

    const {
        handleFetchAllCacheData,
        handleFetchCacheData,
        handleSaveCacheData,
        handleSaveAllCacheData,
        handleDeleteCacheData,
        handleDeleteAllCacheData,
        handleFetchPreference,
        handleSavePreference,
        handleDeletePreference,
    } = useCacheHandler(bridge);
    const {
        handleOpenSettings,
        handleOpenShareSheet,
        handleOpenDocument,
        handleGetContacts,
        handleOpenCamera,
        handleOpenPhotoLibrary,
        handleOpenURL,
    } = useDeviceHandler(bridge);
    const { handleRequestPermission } = usePermissionHandler(bridge);
    const { handleOAuthLogin, handleOAuthLogout } = useOAuthHandler(bridge);

    useAndroidBack(webViewRef, canGoBack, language);

    // Handle WebView load complete
    const handleWebViewLoad = useCallback(() => {
        Logger.info('WEBVIEW', 'WebView loaded');
        setIsWebViewLoaded(true);
        setWebViewReady(true);
    }, [setWebViewReady]);

    // Handle pending deep link URL
    useEffect(() => {
        console.log('[DEEPLINK] effect triggered - pendingUrl:', pendingUrl, 'isWebViewLoaded:', isWebViewLoaded);
        if (pendingUrl && isWebViewLoaded && webViewRef.current) {
            Logger.info('DEEPLINK', `Loading deep link URL: ${pendingUrl}`, pendingEnvs);
            console.log('[DEEPLINK] pendingEnvs:', JSON.stringify(pendingEnvs));

            // Navigate to URL - append _backend, _wss as query params for web layer
            let targetUrl = pendingUrl;
            if (pendingEnvs?.backend || pendingEnvs?.wss) {
                const urlObj = new URL(pendingUrl);
                if (pendingEnvs?.backend) urlObj.searchParams.set('_backend', pendingEnvs.backend);
                if (pendingEnvs?.wss) urlObj.searchParams.set('_wss', pendingEnvs.wss);
                targetUrl = urlObj.toString();
            }
            const script = `window.location.href = '${targetUrl.replace(/'/g, '%27')}';
true;`;
            console.log('[DEEPLINK] injecting script:', script);

            const result = webViewRef.current.injectJavaScript(script);
            console.log('[DEEPLINK] injectJavaScript result:', result);
            clearPendingUrl();
        } else {
            console.log(
                '[DEEPLINK] skipped - pendingUrl:',
                !!pendingUrl,
                'isWebViewLoaded:',
                isWebViewLoaded,
                'webViewRef:',
                !!webViewRef.current
            );
        }
    }, [pendingUrl, pendingEnvs, isWebViewLoaded, clearPendingUrl]);

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
                    case 'SetLanguage': {
                        setLanguage(message.data.language);
                        break;
                    }
                    case 'SetCanGoBack': {
                        setWebCanGoBack(message.data.canGoBack);
                        break;
                    }
                    case 'FetchFcmToken': {
                        void fetchFcmToken();
                        break;
                    }
                    case 'FetchSafeArea': {
                        fetchSafeAreaInfo();
                        break;
                    }
                    case 'RestorePurchase': {
                        void restorePurchase();
                        break;
                    }

                    case 'FetchProducts': {
                        void fetchProducts();
                        break;
                    }

                    case 'FetchCurrentPurchases': {
                        void fetchCurrentPurchases();
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

                    case 'FetchCacheData': {
                        void handleFetchCacheData(message);
                        break;
                    }
                    case 'FetchAllCacheData': {
                        void handleFetchAllCacheData(message);
                        break;
                    }
                    case 'SaveCacheData': {
                        void handleSaveCacheData(message);
                        break;
                    }
                    case 'SaveAllCacheData': {
                        void handleSaveAllCacheData(message);
                        break;
                    }
                    case 'DeleteCacheData': {
                        void handleDeleteCacheData(message);
                        break;
                    }
                    case 'DeleteAllCacheData': {
                        void handleDeleteAllCacheData(message);
                        break;
                    }
                    case 'FetchPreference': {
                        void handleFetchPreference(message);
                        break;
                    }
                    case 'SavePreference': {
                        void handleSavePreference(message);
                        break;
                    }
                    case 'DeletePreference': {
                        void handleDeletePreference(message);
                        break;
                    }
                    case 'OpenSettings': {
                        void handleOpenSettings();
                        break;
                    }
                    case 'OpenShareSheet': {
                        void handleOpenShareSheet(message.data);
                        break;
                    }
                    case 'OpenDocument': {
                        void handleOpenDocument(message.data);
                        break;
                    }
                    case 'GetContacts': {
                        void handleGetContacts();
                        break;
                    }
                    case 'OpenCamera': {
                        void handleOpenCamera(message.data);
                        break;
                    }
                    case 'OpenPhotoLibrary': {
                        void handleOpenPhotoLibrary(message.data);
                        break;
                    }

                    case 'RequestPermission': {
                        void handleRequestPermission(message.data);
                        break;
                    }

                    case 'OAuthLogin': {
                        void handleOAuthLogin(message.data.provider);
                        break;
                    }
                    case 'OAuthLogout': {
                        void handleOAuthLogout(message.data.provider);
                        break;
                    }

                    case 'OpenURL': {
                        void handleOpenURL(message.data);
                        break;
                    }

                    default:
                        if ((message as any).type === '__console__') {
                            const m = message as any;
                            if (m.level === 'error') console.error(m.msg);
                            else console.info(m.msg);
                        } else {
                            console.error(`Failed received error. : ${message.type}`);
                        }
                }
            },
            (error: any, nativeEvent: WebViewMessage) => {
                Logger.error('BRIDGE', `Failed parse message error. : ${nativeEvent.data}`, error);
            }
        );
    }, [
        bridge,
        restorePurchase,
        fetchCurrentPurchases,
        fetchFcmToken,
        fetchProducts,
        fetchSafeAreaInfo,
        navigation,
        purchaseSubscription,
        handleFetchAllCacheData,
        handleFetchCacheData,
        handleSaveCacheData,
        handleSaveAllCacheData,
        handleDeleteCacheData,
        handleDeleteAllCacheData,
        handleFetchPreference,
        handleSavePreference,
        handleDeletePreference,
        handleOpenSettings,
        handleOpenShareSheet,
        handleOpenDocument,
        handleGetContacts,
        handleOpenCamera,
        handleOpenPhotoLibrary,
        handleRequestPermission,
        handleOAuthLogin,
        handleOAuthLogout,
        handleOpenURL,
    ]);

    return (
        <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS.toLowerCase() === 'ios' ? 'padding' : 'height'}
            >
                <AppWebView
                    ref={webViewRef}
                    source={{ uri: webviewUrl }}
                    scrollEnabled={false}
                    onMessage={handleMessage}
                    onLoad={handleWebViewLoad}
                    onNavigationStateChange={navState => {
                        console.log('[WEBVIEW] navState url:', navState.url, 'loading:', navState.loading);
                        setNavCanGoBack(navState.canGoBack);
                    }}
                />
            </KeyboardAvoidingView>
            <FullScreenLoader visible={isIapLoading} message="결제 처리 중..." />
        </View>
    );
};

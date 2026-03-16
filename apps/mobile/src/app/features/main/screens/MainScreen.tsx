import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppWebView, FullScreenLoader, Logger, useDeepLinkStore } from '../../../common';
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

const webviewUrl = Config.VITE_WEBVIEW_BASE_URL ?? 'http://localhost:5003';

export const MainScreen = ({ navigation }: MainScreenProps) => {
    const webViewRef = useRef<WebView>(null);
    const isFocused = useIsFocused();
    const isModalOpened = useRef(false);
    const [canGoBack, setCanGoBack] = useState(false);
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
    } = useDeviceHandler(bridge);
    const { handleRequestPermission } = usePermissionHandler(bridge);
    const { handleOAuthLogin, handleOAuthLogout } = useOAuthHandler(bridge);

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
            Logger.info('DEEPLINK', `Loading deep link URL: ${pendingUrl}`, pendingEnvs);

            // Build injection script
            let script = '';

            // Store envs in localStorage (persists across app restarts)
            // backend replaces all API endpoints (OAUTH, DOU)
            if (pendingEnvs?.backend) {
                const safeBackend = encodeURI(pendingEnvs.backend).replace(/'/g, '%27');
                script += `localStorage.setItem('CHATIC_OAUTH_ENDPOINT', '${safeBackend}');\n`;
                script += `localStorage.setItem('CHATIC_DOU_ENDPOINT', '${safeBackend}');\n`;
            }
            if (pendingEnvs?.wss) {
                const message: AppMessageData<'OnSetWsEndpoint'> = {
                    type: 'OnSetWsEndpoint',
                    data: { wss: pendingEnvs.wss },
                };
                bridge.post(message);
            }

            // Navigate to URL
            const safeUrl = encodeURI(pendingUrl).replace(/'/g, '%27');
            script += `window.location.href = '${safeUrl}';\n`;
            script += 'true;';

            webViewRef.current.injectJavaScript(script);
            clearPendingUrl();
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
     * @author dev@example.com
     */
    const handleMessage: (event: WebViewMessageEvent) => void = useMemo(() => {
        return bridge.receive(
            (message: WebMessageData<WebMessageType>) => {
                switch (message.type) {
                    case 'SetCanGoBack': {
                        setCanGoBack(message.data.canGoBack);
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
                        setCanGoBack(navState.canGoBack);
                    }}
                />
            </KeyboardAvoidingView>
            <FullScreenLoader visible={isIapLoading} message="결제 처리 중..." />
        </View>
    );
};

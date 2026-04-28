import { useMemo } from 'react';
import type { WebViewBridge } from '../../../common';
import { logger, useLanguageStore, useThemeStore } from '../../../common';
import {
    useCrudCacheHandler,
    useDeviceHandler,
    useFcmHandler,
    useOAuthHandler,
    usePermissionHandler,
    usePreferenceCacheHandler,
    useSafeAreaHandler,
    useSearchCacheHandler,
    useSubscriptionIapHandler,
} from '../../../common/webview/hooks';
import { useModalHandler } from '../../../common/webview/hooks/useModalHandler';

import type { WebMessageData, WebMessageType } from '@chatic/app-messages';
import type { WebViewMessage } from 'react-native-webview/lib/WebViewTypes';
import type { MainScreenProps } from '../navigation';
import { useAppStateHandler } from '../../../common/webview/hooks/useAppStateHandler';

/**
 * Props for the useWebMessageRouter hook.
 */
export interface UseWebMessageRouterProps {
    /** Bridge instance for communicating with the WebView */
    bridge: WebViewBridge;
    /** React Navigation object for navigating to native screens (e.g., Modals) */
    navigation: MainScreenProps['navigation'];
    /** Callback to update the state indicating if the web layer can handle back navigation */
    setWebCanGoBack: (canGoBack: boolean) => void;
}

/**
 * Central router for handling messages sent from the Web (WebView) to the Native App.
 * It acts as a Facade, delegating specific tasks to domain-specific handler hooks.
 *
 * @param props - Dependencies injected from the MainScreen (bridge, navigation, etc.)
 * @returns An object containing the message handler callback and IAP loading state.
 */
export const useWebMessageRouter = ({ bridge, navigation, setWebCanGoBack }: UseWebMessageRouterProps) => {
    // --- Global App States ---
    const setLanguage = useLanguageStore(state => state.setLanguage);
    const setTheme = useThemeStore(state => state.setTheme);

    // --- Domain-specific Handlers ---
    const { fetchSafeAreaInfo } = useSafeAreaHandler(bridge);
    const { syncAppStateToWeb } = useAppStateHandler(bridge);
    const { fetchFcmToken } = useFcmHandler(bridge);
    const {
        fetchProducts,
        fetchCurrentPurchases,
        handlePurchaseSubscription,
        handleFinishPurchase,
        handleOpenSubscriptionManagement,
        isIapLoading,
    } = useSubscriptionIapHandler(bridge);

    const {
        handleFetchAllCache,
        handleFetchCache,
        handleSaveCache,
        handleSaveAllCache,
        handleDeleteCache,
        handleDeleteAllCache,
        handleClearCache,
    } = useCrudCacheHandler(bridge);

    const { handleFetchPreference, handleSavePreference, handleDeletePreference } = usePreferenceCacheHandler(bridge);

    const { handleSearchGlobalCache } = useSearchCacheHandler(bridge);

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

    const { handleOpenModal, handleCloseModal } = useModalHandler(bridge, navigation);

    /**
     * The main message receiver.
     * Parses the incoming Web message and routes it to the appropriate handler based on its type.
     */
    const handleMessage = useMemo(() => {
        return bridge.receive(
            (message: WebMessageData<WebMessageType>) => {
                switch (message.type) {
                    // -- App Settings & UI State --
                    case 'SetCanGoBack':
                        setWebCanGoBack(message.data.canGoBack);
                        break;
                    // -- Push Notifications & Device Info --
                    case 'FetchFcmToken':
                        void fetchFcmToken();
                        break;
                    case 'FetchSafeArea':
                        fetchSafeAreaInfo();
                        break;
                    case 'FetchBackgroundStatus':
                        syncAppStateToWeb();
                        break;
                    // -- In-App Purchases (IAP) --

                    case 'FetchProducts':
                        void fetchProducts();
                        break;
                    case 'FetchCurrentPurchases':
                        void fetchCurrentPurchases();
                        break;
                    case 'Purchase':
                        void handlePurchaseSubscription(message.data);
                        break;
                    case 'FinishPurchaseTransaction':
                        void handleFinishPurchase(message.data.purchase);
                        break;
                    case `OpenSubscriptionManagement`:
                        void handleOpenSubscriptionManagement();
                        break;

                    // -- Native Modals --
                    case 'OpenModal': {
                        handleOpenModal(message.data);
                        break;
                    }
                    case 'CloseModal':
                        handleCloseModal();
                        break;
                    // -- Cache Management --
                    case 'FetchCacheData':
                        void handleFetchCache(message);
                        break;
                    case 'FetchAllCacheData':
                        void handleFetchAllCache(message);
                        break;
                    case 'SaveCacheData':
                        void handleSaveCache(message);
                        break;
                    case 'SaveAllCacheData':
                        void handleSaveAllCache(message);
                        break;
                    case 'DeleteCacheData':
                        void handleDeleteCache(message);
                        break;
                    case 'DeleteAllCacheData':
                        void handleDeleteAllCache(message);
                        break;
                    case `SearchGlobalCacheData`:
                        void handleSearchGlobalCache(message);
                        break;
                    case 'ClearCacheData':
                        void handleClearCache(message);
                        break;
                    // -- Preference Management --
                    case 'FetchPreference':
                        void handleFetchPreference(message);
                        break;
                    case 'SavePreference':
                        void handleSavePreference(message);
                        break;
                    case 'DeletePreference':
                        void handleDeletePreference(message);
                        break;
                    // -- Native Device Features (Camera, Gallery, Sharing, etc.) --
                    case 'OpenSettings':
                        void handleOpenSettings();
                        break;
                    case 'OpenShareSheet':
                        void handleOpenShareSheet(message);
                        break;
                    case 'OpenDocument':
                        void handleOpenDocument(message);
                        break;
                    case 'GetContacts':
                        void handleGetContacts(message);
                        break;
                    case 'OpenCamera':
                        void handleOpenCamera(message);
                        break;
                    case 'OpenPhotoLibrary':
                        void handleOpenPhotoLibrary(message);
                        break;
                    case 'RequestPermission':
                        void handleRequestPermission(message.data);
                        break;
                    // -- Authentication & External Links --
                    case 'OAuthLogin':
                        void handleOAuthLogin(message.data.provider);
                        break;
                    case 'OAuthLogout':
                        void handleOAuthLogout(message.data.provider);
                        break;
                    case 'OpenURL':
                        void handleOpenURL(message);
                        break;
                    default:
                        if ((message as any).type === '__console__') {
                            const m = message as any;
                            if (m.level === 'error') {
                                logger.error('WEBVIEW', m.msg, m.data);
                            } else {
                                logger.info('WEBVIEW', m.msg, m.data);
                            }
                        } else {
                            console.error(`Failed received error. : ${message.type}`);
                        }
                }
            },
            (error: unknown, nativeEvent: WebViewMessage) => {
                logger.error('BRIDGE', `Failed parse message error. : ${nativeEvent.data}`, error);
            }
        );
    }, [
        bridge,
        setLanguage,
        setTheme,
        setWebCanGoBack,
        handleOpenModal,
        handleCloseModal,
        fetchFcmToken,
        fetchSafeAreaInfo,
        syncAppStateToWeb,
        fetchProducts,
        fetchCurrentPurchases,
        handlePurchaseSubscription,
        handleFinishPurchase,
        handleOpenSubscriptionManagement,
        handleFetchCache,
        handleFetchAllCache,
        handleSaveCache,
        handleSaveAllCache,
        handleDeleteCache,
        handleDeleteAllCache,
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

    return { handleMessage, isIapLoading };
};

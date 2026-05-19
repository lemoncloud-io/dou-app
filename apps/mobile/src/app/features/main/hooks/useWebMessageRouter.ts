import { useEffect, useRef } from 'react';
import {
    useAppIconHandler,
    useCrudCacheHandler,
    useDeviceHandler,
    useFcmHandler,
    useLogBufferHandler,
    useLogHandler,
    useOAuthHandler,
    usePermissionHandler,
    usePreferenceCacheHandler,
    useSafeAreaHandler,
    useSearchCacheHandler,
    useSubscriptionIapHandler,
} from '../../../webview/hooks';
import { useModalHandler } from '../../../webview/hooks/useModalHandler';

import type { WebMessageType } from '@chatic/app-messages';
import type { MainScreenProps } from '../navigation';
import { useAppStateHandler } from '../../../webview/hooks/useAppStateHandler';
import { logger } from '../../../services';
import type { IAppBridgeHost } from '@chatic/bridges';

/**
 * Props for the useWebMessageRouter hook.
 */
export interface UseWebMessageRouterProps {
    /** Bridge instance for communicating with the WebView */
    bridge: IAppBridgeHost;
    /** React Navigation object for navigating to native screens (e.g., Modals) */
    navigation: MainScreenProps['navigation'];
    /** Callback to update the state indicating if the web layer can handle back navigation */
    setWebCanGoBack: (canGoBack: boolean) => void;
}

/**
 * Central router for handling messages sent from the Web (WebView) to the Native App.
 * It acts as a Facade, delegating specific tasks to domain-specific handler hooks.
 * This hook also implements a message queue to process incoming messages sequentially, preventing race conditions and bottlenecks.
 *
 * @param props - Dependencies injected from the MainScreen (bridge, navigation, etc.)
 * @returns An object containing the message handler callback and IAP loading state.
 */
export const useWebMessageRouter = ({ bridge, navigation, setWebCanGoBack }: UseWebMessageRouterProps) => {
    // --- Domain-specific Handlers (memoized with useCallback) ---
    const { fetchSafeAreaInfo } = useSafeAreaHandler();
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
    } = useCrudCacheHandler();

    const { handleFetchPreference, handleSavePreference, handleDeletePreference } = usePreferenceCacheHandler();
    const { handleSendLog } = useLogHandler();
    const { handleFetchAppLogBuffer, handlePollAppLogBuffer, handleClearAppLogBuffer, handleFetchAppLogBufferSize } =
        useLogBufferHandler();

    const { handleSearchGlobalCache } = useSearchCacheHandler();

    const {
        handleOpenSettings,
        handleOpenShareSheet,
        handleOpenDocument,
        handleGetContacts,
        handleOpenCamera,
        handleOpenPhotoLibrary,
        handleOpenURL,
    } = useDeviceHandler();

    const { handleRequestPermission } = usePermissionHandler();
    const { handleOAuthLogin, handleOAuthLogout } = useOAuthHandler();
    const { handleFetchAppIcon, handleFetchAppIconList, handleChangeAppIcon } = useAppIconHandler();

    const { handleOpenModal, handleCloseModal } = useModalHandler(bridge, navigation);

    // --- Keep handlers fresh for async execution without triggering re-renders ---
    const handlersRef = useRef({
        setWebCanGoBack,
        fetchFcmToken,
        fetchSafeAreaInfo,
        syncAppStateToWeb,
        fetchProducts,
        fetchCurrentPurchases,
        handlePurchaseSubscription,
        handleFinishPurchase,
        handleOpenSubscriptionManagement,
        handleOpenModal,
        handleCloseModal,
        handleFetchCache,
        handleFetchAllCache,
        handleSaveCache,
        handleSaveAllCache,
        handleDeleteCache,
        handleDeleteAllCache,
        handleSearchGlobalCache,
        handleClearCache,
        handleFetchPreference,
        handleSavePreference,
        handleDeletePreference,
        handleFetchAppLogBuffer,
        handlePollAppLogBuffer,
        handleClearAppLogBuffer,
        handleFetchAppLogBufferSize,
        handleSendLog,
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
        handleFetchAppIcon,
        handleFetchAppIconList,
        handleChangeAppIcon,
    });

    useEffect(() => {
        handlersRef.current = {
            setWebCanGoBack,
            fetchFcmToken,
            fetchSafeAreaInfo,
            syncAppStateToWeb,
            fetchProducts,
            fetchCurrentPurchases,
            handlePurchaseSubscription,
            handleFinishPurchase,
            handleOpenSubscriptionManagement,
            handleOpenModal,
            handleCloseModal,
            handleFetchCache,
            handleFetchAllCache,
            handleSaveCache,
            handleSaveAllCache,
            handleDeleteCache,
            handleDeleteAllCache,
            handleSearchGlobalCache,
            handleClearCache,
            handleFetchPreference,
            handleSavePreference,
            handleDeletePreference,
            handleFetchAppLogBuffer,
            handlePollAppLogBuffer,
            handleClearAppLogBuffer,
            handleFetchAppLogBufferSize,
            handleSendLog,
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
            handleFetchAppIcon,
            handleFetchAppIconList,
            handleChangeAppIcon,
        };
    });

    useEffect(() => {
        const handlerMap = {
            SetCanGoBack: (data: { canGoBack: boolean }) => handlersRef.current.setWebCanGoBack(data.canGoBack),
            FetchFcmToken: () => handlersRef.current.fetchFcmToken(),
            FetchSafeArea: () => handlersRef.current.fetchSafeAreaInfo(),
            FetchBackgroundStatus: () => handlersRef.current.syncAppStateToWeb(),
            FetchProducts: () => handlersRef.current.fetchProducts(),
            FetchCurrentPurchases: () => handlersRef.current.fetchCurrentPurchases(),
            Purchase: (data: any) => handlersRef.current.handlePurchaseSubscription(data),
            FinishPurchaseTransaction: (data: { purchase: any }) =>
                handlersRef.current.handleFinishPurchase(data.purchase),
            OpenSubscriptionManagement: () => handlersRef.current.handleOpenSubscriptionManagement(),
            OpenModal: (data: any) => handlersRef.current.handleOpenModal(data),
            CloseModal: () => handlersRef.current.handleCloseModal(),
            FetchCacheData: (data: any) => handlersRef.current.handleFetchCache(data),
            FetchAllCacheData: (data: any) => handlersRef.current.handleFetchAllCache(data),
            SaveCacheData: (data: any) => handlersRef.current.handleSaveCache(data),
            SaveAllCacheData: (data: any) => handlersRef.current.handleSaveAllCache(data),
            DeleteCacheData: (data: any) => handlersRef.current.handleDeleteCache(data),
            DeleteAllCacheData: (data: any) => handlersRef.current.handleDeleteAllCache(data),
            SearchGlobalCacheData: (data: any) => handlersRef.current.handleSearchGlobalCache({ data } as any),
            ClearCacheData: (data: any) => handlersRef.current.handleClearCache(data),
            FetchPreference: (data: any) => handlersRef.current.handleFetchPreference({ data } as any),
            SavePreference: (data: any) => handlersRef.current.handleSavePreference({ data } as any),
            DeletePreference: (data: any) => handlersRef.current.handleDeletePreference({ data } as any),
            FetchAppLogBuffer: (data: any) => handlersRef.current.handleFetchAppLogBuffer(data),
            PollAppLogBuffer: (data: any) => handlersRef.current.handlePollAppLogBuffer(data),
            ClearAppLogBuffer: (data: any) => handlersRef.current.handleClearAppLogBuffer(),
            FetchAppLogBufferSize: (data: any) => handlersRef.current.handleFetchAppLogBufferSize(),
            SendLog: (data: any) => handlersRef.current.handleSendLog({ data } as any),
            OpenSettings: () => handlersRef.current.handleOpenSettings(),
            OpenShareSheet: (data: any) => handlersRef.current.handleOpenShareSheet(data),
            OpenDocument: (data: any) => handlersRef.current.handleOpenDocument(data),
            GetContacts: (data: any) => handlersRef.current.handleGetContacts(data),
            OpenCamera: (data: any) => handlersRef.current.handleOpenCamera(data),
            OpenPhotoLibrary: (data: any) => handlersRef.current.handleOpenPhotoLibrary(data),
            RequestPermission: (data: any) => handlersRef.current.handleRequestPermission(data),
            OAuthLogin: (data: { provider: any }) => handlersRef.current.handleOAuthLogin(data.provider),
            OAuthLogout: (data: { provider: any }) => handlersRef.current.handleOAuthLogout(data.provider),
            OpenURL: (data: any) => handlersRef.current.handleOpenURL(data),
            FetchAppIcon: (data: any) => handlersRef.current.handleFetchAppIcon(),
            FetchAppIconList: (data: any) => handlersRef.current.handleFetchAppIconList(),
            ChangeAppIcon: (data: any) => handlersRef.current.handleChangeAppIcon(data),
        };

        Object.entries(handlerMap).forEach(([type, handler]) => {
            bridge.registerHandler(type as WebMessageType, handler as any);
        });

        // Special handling for console logs from webview
        bridge.registerHandler('__console__' as any, async (message: any) => {
            if (message.level === 'error') {
                logger.error('WEBVIEW', message.msg, message.data);
            } else {
                logger.info('WEBVIEW', message.msg, message.data);
            }
        });

        return () => {
            Object.keys(handlerMap).forEach(type => {
                bridge.unregisterHandler(type as WebMessageType);
            });
            bridge.unregisterHandler('__console__' as any);
        };
    }, [bridge]);

    return { isIapLoading };
};

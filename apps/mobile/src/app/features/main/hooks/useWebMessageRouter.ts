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

import type {
    ChangeAppIcon,
    ClearAppLogBuffer,
    ClearCacheData,
    CloseModal,
    DeleteAllCacheData,
    DeleteCacheData,
    DeletePreference,
    FetchAllCacheData,
    FetchAppIcon,
    FetchAppIconList,
    FetchAppLogBuffer,
    FetchAppLogBufferSize,
    FetchBackgroundStatus,
    FetchCacheData,
    FetchCurrentPurchases,
    FetchFcmToken,
    FetchPreference,
    FetchProducts,
    FetchSafeArea,
    FinishPurchaseTransaction,
    GetContacts,
    OAuthLogin,
    OAuthLogout,
    OpenCamera,
    OpenDocument,
    OpenModal,
    OpenPhotoLibrary,
    OpenSettings,
    OpenShareSheet,
    OpenSubscriptionManagement,
    OpenURL,
    PollAppLogBuffer,
    Purchase,
    RequestPermission,
    SaveAllCacheData,
    SaveCacheData,
    SavePreference,
    SearchGlobalCacheData,
    SendLog,
    SetCanGoBack,
    WebMessageType,
} from '@chatic/app-messages';
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
    setWebCanGoBack: (message: SetCanGoBack) => void;
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
    const { handleFetchBackgroundStatus } = useAppStateHandler(bridge);
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
        handleFetchBackgroundStatus,
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
            handleFetchBackgroundStatus,
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
            SetCanGoBack: (message: SetCanGoBack) => handlersRef.current.setWebCanGoBack(message),
            FetchFcmToken: (message: FetchFcmToken) => handlersRef.current.fetchFcmToken(message),
            FetchSafeArea: (message: FetchSafeArea) => handlersRef.current.fetchSafeAreaInfo(message),
            FetchBackgroundStatus: (message: FetchBackgroundStatus) =>
                handlersRef.current.handleFetchBackgroundStatus(message),
            FetchProducts: (message: FetchProducts) => handlersRef.current.fetchProducts(message),
            FetchCurrentPurchases: (message: FetchCurrentPurchases) =>
                handlersRef.current.fetchCurrentPurchases(message),
            Purchase: (message: Purchase) => handlersRef.current.handlePurchaseSubscription(message),
            FinishPurchaseTransaction: (message: FinishPurchaseTransaction) =>
                handlersRef.current.handleFinishPurchase(message),
            OpenSubscriptionManagement: (message: OpenSubscriptionManagement) =>
                handlersRef.current.handleOpenSubscriptionManagement(message),
            OpenModal: (message: OpenModal) => handlersRef.current.handleOpenModal(message),
            CloseModal: (message: CloseModal) => handlersRef.current.handleCloseModal(message),
            FetchCacheData: (message: FetchCacheData) => handlersRef.current.handleFetchCache(message),
            FetchAllCacheData: (message: FetchAllCacheData) => handlersRef.current.handleFetchAllCache(message),
            SaveCacheData: (message: SaveCacheData) => handlersRef.current.handleSaveCache(message),
            SaveAllCacheData: (message: SaveAllCacheData) => handlersRef.current.handleSaveAllCache(message),
            DeleteCacheData: (message: DeleteCacheData) => handlersRef.current.handleDeleteCache(message),
            DeleteAllCacheData: (message: DeleteAllCacheData) => handlersRef.current.handleDeleteAllCache(message),
            SearchGlobalCacheData: (message: SearchGlobalCacheData) =>
                handlersRef.current.handleSearchGlobalCache(message),
            ClearCacheData: (message: ClearCacheData) => handlersRef.current.handleClearCache(message),
            FetchPreference: (message: FetchPreference) => handlersRef.current.handleFetchPreference(message),
            SavePreference: (message: SavePreference) => handlersRef.current.handleSavePreference(message),
            DeletePreference: (message: DeletePreference) => handlersRef.current.handleDeletePreference(message),
            FetchAppLogBuffer: (message: FetchAppLogBuffer) => handlersRef.current.handleFetchAppLogBuffer(message),
            PollAppLogBuffer: (message: PollAppLogBuffer) => handlersRef.current.handlePollAppLogBuffer(message),
            ClearAppLogBuffer: (message: ClearAppLogBuffer) => handlersRef.current.handleClearAppLogBuffer(message),
            FetchAppLogBufferSize: (message: FetchAppLogBufferSize) =>
                handlersRef.current.handleFetchAppLogBufferSize(message),
            SendLog: (message: SendLog) => handlersRef.current.handleSendLog(message),
            OpenSettings: (message: OpenSettings) => handlersRef.current.handleOpenSettings(message),
            OpenShareSheet: (message: OpenShareSheet) => handlersRef.current.handleOpenShareSheet(message),
            OpenDocument: (message: OpenDocument) => handlersRef.current.handleOpenDocument(message),
            GetContacts: (message: GetContacts) => handlersRef.current.handleGetContacts(message),
            OpenCamera: (message: OpenCamera) => handlersRef.current.handleOpenCamera(message),
            OpenPhotoLibrary: (message: OpenPhotoLibrary) => handlersRef.current.handleOpenPhotoLibrary(message),
            RequestPermission: (message: RequestPermission) =>
                handlersRef.current.handleRequestPermission(message.data),
            OAuthLogin: (message: OAuthLogin) => handlersRef.current.handleOAuthLogin(message),
            OAuthLogout: (message: OAuthLogout) => handlersRef.current.handleOAuthLogout(message),
            OpenURL: (message: OpenURL) => handlersRef.current.handleOpenURL(message),
            FetchAppIcon: (message: FetchAppIcon) => handlersRef.current.handleFetchAppIcon(message),
            FetchAppIconList: (message: FetchAppIconList) => handlersRef.current.handleFetchAppIconList(message),
            ChangeAppIcon: (message: ChangeAppIcon) => handlersRef.current.handleChangeAppIcon(message),
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

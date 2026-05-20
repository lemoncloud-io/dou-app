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
} from './index';
import { type ModalHandler, useModalHandler } from './useModalHandler';

import type { WebMessageData, WebMessageType } from '@chatic/app-messages';
import { useAppStateHandler } from './useAppStateHandler';
import type { IAppBridgeHost } from '@chatic/bridges';

/**
 * Props for the useWebMessageRouter hook.
 */
export interface UseWebMessageRouterProps {
    /** Bridge instance for communicating with the WebView */
    bridge: IAppBridgeHost;
    /** Handler for modal operations */
    modalHandler: ModalHandler;
    /** Callback to update the state indicating if the web layer can handle back navigation */
    setWebCanGoBack: (back: boolean) => void;
}

/**
 * Central router for handling messages sent from the Web (WebView) to the Native App.
 * It acts as a Facade, delegating specific tasks to domain-specific handler hooks.
 * This hook also implements a message queue to process incoming messages sequentially, preventing race conditions and bottlenecks.
 *
 * @param props - Dependencies injected from the MainScreen (bridge, navigation, etc.)
 * @returns An object containing the message handler callback and IAP loading state.
 */
export const useWebMessageRouter = ({ bridge, modalHandler, setWebCanGoBack }: UseWebMessageRouterProps) => {
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

    const { handleOpenModal, handleCloseModal } = useModalHandler(bridge, modalHandler);

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
        // 타입 추론을 완벽하게 지원하는 라우팅 맵을 구성합니다.
        const handlerMap: {
            [K in WebMessageType]?: (message: WebMessageData<K>) => any;
        } = {
            SetCanGoBack: message => handlersRef.current.setWebCanGoBack(message.payload.canGoBack),
            FetchFcmToken: message => handlersRef.current.fetchFcmToken(message),
            FetchSafeArea: message => handlersRef.current.fetchSafeAreaInfo(message),
            FetchBackgroundStatus: message => handlersRef.current.handleFetchBackgroundStatus(message),
            FetchProducts: message => handlersRef.current.fetchProducts(message),
            FetchCurrentPurchases: message => handlersRef.current.fetchCurrentPurchases(message),
            Purchase: message => handlersRef.current.handlePurchaseSubscription(message),
            FinishPurchaseTransaction: message => handlersRef.current.handleFinishPurchase(message),
            OpenSubscriptionManagement: message => handlersRef.current.handleOpenSubscriptionManagement(message),
            OpenModal: message => handlersRef.current.handleOpenModal(message),
            CloseModal: message => handlersRef.current.handleCloseModal(message),
            FetchCacheData: message => handlersRef.current.handleFetchCache(message),
            FetchAllCacheData: message => handlersRef.current.handleFetchAllCache(message),
            SaveCacheData: message => handlersRef.current.handleSaveCache(message),
            SaveAllCacheData: message => handlersRef.current.handleSaveAllCache(message),
            DeleteCacheData: message => handlersRef.current.handleDeleteCache(message),
            DeleteAllCacheData: message => handlersRef.current.handleDeleteAllCache(message),
            SearchGlobalCacheData: message => handlersRef.current.handleSearchGlobalCache(message),
            ClearCacheData: message => handlersRef.current.handleClearCache(message),
            FetchPreference: message => handlersRef.current.handleFetchPreference(message),
            SavePreference: message => handlersRef.current.handleSavePreference(message),
            DeletePreference: message => handlersRef.current.handleDeletePreference(message),
            FetchAppLogBuffer: message => handlersRef.current.handleFetchAppLogBuffer(message),
            PollAppLogBuffer: message => handlersRef.current.handlePollAppLogBuffer(message),
            ClearAppLogBuffer: message => handlersRef.current.handleClearAppLogBuffer(message),
            FetchAppLogBufferSize: message => handlersRef.current.handleFetchAppLogBufferSize(message),
            SendLog: message => handlersRef.current.handleSendLog(message),
            OpenSettings: message => handlersRef.current.handleOpenSettings(message),
            OpenShareSheet: message => handlersRef.current.handleOpenShareSheet(message),
            OpenDocument: message => handlersRef.current.handleOpenDocument(message),
            GetContacts: message => handlersRef.current.handleGetContacts(message),
            OpenCamera: message => handlersRef.current.handleOpenCamera(message),
            OpenPhotoLibrary: message => handlersRef.current.handleOpenPhotoLibrary(message),
            RequestPermission: message => handlersRef.current.handleRequestPermission(message),
            OAuthLogin: message => handlersRef.current.handleOAuthLogin(message),
            OAuthLogout: message => handlersRef.current.handleOAuthLogout(message),
            OpenURL: message => handlersRef.current.handleOpenURL(message),
            FetchAppIcon: message => handlersRef.current.handleFetchAppIcon(message),
            FetchAppIconList: message => handlersRef.current.handleFetchAppIconList(message),
            ChangeAppIcon: message => handlersRef.current.handleChangeAppIcon(message),
        };

        // Bridge에 핸들러 등록
        (Object.keys(handlerMap) as WebMessageType[]).forEach(type => {
            const handler = handlerMap[type];
            if (handler) {
                bridge.registerHandler(type, handler as any);
            }
        });

        return () => {
            (Object.keys(handlerMap) as WebMessageType[]).forEach(type => {
                bridge.unregisterHandler(type);
            });
            bridge.unregisterHandler('__console__' as any);
        };
    }, [bridge]);

    return { isIapLoading };
};

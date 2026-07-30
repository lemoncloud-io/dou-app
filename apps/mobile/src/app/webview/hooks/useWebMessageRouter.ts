import { useEffect, useRef } from 'react';
import {
    useAppIconHandler,
    useAppUpdateHandler,
    useCrudCacheHandler,
    useClipboardHandler,
    useDeviceHandler,
    useSmsHandler,
    useFcmHandler,
    useLogBufferHandler,
    useLogHandler,
    useOAuthHandler,
    usePermissionHandler,
    usePreferenceCacheHandler,
    useSafeAreaHandler,
    useSearchCacheHandler,
    useSubscriptionIapHandler,
    useUploadHandler,
    useTestRecordHandler,
    useResumeOverlay,
    usePerfHandler,
} from './index';

import type { WebMessageData, WebMessageType } from '@chatic/app-messages';
import { useAppStateHandler } from './useAppStateHandler';
import type { IAppBridgeHost } from '@chatic/bridges';

/**
 * Props for the useWebMessageRouter hook.
 */
export interface UseWebMessageRouterProps {
    /** Bridge instance for communicating with the WebView */
    bridge: IAppBridgeHost;
}

/**
 * Central router for handling messages sent from the Web (WebView) to the Native App.
 * It acts as a Facade, delegating specific tasks to domain-specific handler hooks.
 * This hook also implements a message queue to process incoming messages sequentially, preventing race conditions and bottlenecks.
 *
 * @param props - Dependencies injected from the MainScreen (bridge, navigation, etc.)
 * @returns An object containing the message handler callback and IAP loading state.
 */
export const useWebMessageRouter = ({ bridge }: UseWebMessageRouterProps) => {
    const { showResumeOverlay, dismissOverlay } = useResumeOverlay();

    // --- Domain-specific Handlers (memoized with useCallback) ---
    const { fetchSafeAreaInfo } = useSafeAreaHandler();
    const { handleFetchBackgroundStatus, handleDismissResumeOverlay } = useAppStateHandler(bridge, dismissOverlay);
    const { fetchFcmToken, handleFetchBadgeCount, handleSetBadgeCount } = useFcmHandler(bridge);
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
        handleCreateDummyFile,
    } = useDeviceHandler();

    const { handleSendSms } = useSmsHandler();

    const {
        handleRequestFileUpload,
        handlePauseFileUpload,
        handleResumeFileUpload,
        handleCancelFileUpload,
        handleListRecoverableUploads,
        handleRecoverUpload,
        handleRetryUpload,
    } = useUploadHandler(bridge);

    const { handleRequestPermission } = usePermissionHandler();
    const { handleOAuthLogin, handleOAuthLogout } = useOAuthHandler();
    const { handleCheckAppUpdate, handleOpenStore } = useAppUpdateHandler();
    const { handleFetchAppIcon, handleFetchAppIconList, handleChangeAppIcon } = useAppIconHandler();
    const { handleCopyToClipboard } = useClipboardHandler();
    const { handleSendBootMetrics, handleSetDebugMode } = usePerfHandler();

    const {
        handleFetchTestRecord,
        handleFetchAllTestRecords,
        handleSaveTestRecord,
        handleSaveAllTestRecords,
        handleClearTestRecords,
    } = useTestRecordHandler();

    // --- Keep handlers fresh for async execution without triggering re-renders ---
    const handlersRef = useRef({
        fetchFcmToken,
        handleFetchBadgeCount,
        handleSetBadgeCount,
        fetchSafeAreaInfo,
        handleFetchBackgroundStatus,
        handleDismissResumeOverlay,
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
        handleCheckAppUpdate,
        handleOpenStore,
        handleOpenURL,
        handleSendSms,
        handleCreateDummyFile,
        handleFetchAppIcon,
        handleFetchAppIconList,
        handleChangeAppIcon,
        handleCopyToClipboard,
        handleSendBootMetrics,
        handleSetDebugMode,
        handleRequestFileUpload,
        handlePauseFileUpload,
        handleResumeFileUpload,
        handleCancelFileUpload,
        handleListRecoverableUploads,
        handleRecoverUpload,
        handleRetryUpload,
        handleFetchTestRecord,
        handleFetchAllTestRecords,
        handleSaveTestRecord,
        handleSaveAllTestRecords,
        handleClearTestRecords,
    });

    useEffect(() => {
        handlersRef.current = {
            fetchFcmToken,
            handleFetchBadgeCount,
            handleSetBadgeCount,
            fetchSafeAreaInfo,
            handleFetchBackgroundStatus,
            handleDismissResumeOverlay,
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
            handleCheckAppUpdate,
            handleOpenStore,
            handleOpenURL,
            handleSendSms,
            handleCreateDummyFile,
            handleFetchAppIcon,
            handleFetchAppIconList,
            handleChangeAppIcon,
            handleCopyToClipboard,
            handleSendBootMetrics,
            handleSetDebugMode,
            handleFetchTestRecord,
            handleFetchAllTestRecords,
            handleSaveTestRecord,
            handleSaveAllTestRecords,
            handleClearTestRecords,
            handleRequestFileUpload,
            handlePauseFileUpload,
            handleResumeFileUpload,
            handleCancelFileUpload,
            handleListRecoverableUploads,
            handleRecoverUpload,
            handleRetryUpload,
        };
    });

    useEffect(() => {
        // 타입 추론을 완벽하게 지원하는 라우팅 맵을 구성합니다.
        const handlerMap: {
            [K in WebMessageType]?: (message: WebMessageData<K>) => any;
        } = {
            FetchFcmToken: message => handlersRef.current.fetchFcmToken(message),
            FetchBadgeCount: message => handlersRef.current.handleFetchBadgeCount(message),
            SetBadgeCount: message => handlersRef.current.handleSetBadgeCount(message),
            FetchSafeArea: message => handlersRef.current.fetchSafeAreaInfo(message),
            FetchBackgroundStatus: message => handlersRef.current.handleFetchBackgroundStatus(message),
            FetchProducts: message => handlersRef.current.fetchProducts(message),
            FetchCurrentPurchases: message => handlersRef.current.fetchCurrentPurchases(message),
            Purchase: message => handlersRef.current.handlePurchaseSubscription(message),
            FinishPurchaseTransaction: message => handlersRef.current.handleFinishPurchase(message),
            OpenSubscriptionManagement: message => handlersRef.current.handleOpenSubscriptionManagement(message),
            FetchCacheData: message => handlersRef.current.handleFetchCache(message),
            FetchAllCacheData: message => handlersRef.current.handleFetchAllCache(message),
            SaveCacheData: message => handlersRef.current.handleSaveCache(message),
            SaveAllCacheData: message => handlersRef.current.handleSaveAllCache(message),
            DeleteCacheData: message => handlersRef.current.handleDeleteCache(message),
            DeleteAllCacheData: message => handlersRef.current.handleDeleteAllCache(message),
            SearchGlobalCacheData: message => handlersRef.current.handleSearchGlobalCache(message),
            ClearCacheData: message => handlersRef.current.handleClearCache(message),
            FetchTestRecord: message => handlersRef.current.handleFetchTestRecord(message),
            FetchAllTestRecords: message => handlersRef.current.handleFetchAllTestRecords(message),
            SaveTestRecord: message => handlersRef.current.handleSaveTestRecord(message),
            SaveAllTestRecords: message => handlersRef.current.handleSaveAllTestRecords(message),
            ClearTestRecords: message => handlersRef.current.handleClearTestRecords(message),
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
            CheckAppUpdate: message => handlersRef.current.handleCheckAppUpdate(message),
            OpenStore: message => handlersRef.current.handleOpenStore(message),
            OpenURL: message => handlersRef.current.handleOpenURL(message),
            SendSms: message => handlersRef.current.handleSendSms(message),
            FetchAppIcon: message => handlersRef.current.handleFetchAppIcon(message),
            FetchAppIconList: message => handlersRef.current.handleFetchAppIconList(message),
            ChangeAppIcon: message => handlersRef.current.handleChangeAppIcon(message),
            CopyToClipboard: message => handlersRef.current.handleCopyToClipboard(message),
            RequestFileUpload: message => handlersRef.current.handleRequestFileUpload(message),
            PauseFileUpload: message => handlersRef.current.handlePauseFileUpload(message),
            ResumeFileUpload: message => handlersRef.current.handleResumeFileUpload(message),
            CancelFileUpload: message => handlersRef.current.handleCancelFileUpload(message),
            ListRecoverableUploads: () => handlersRef.current.handleListRecoverableUploads(),
            RecoverUpload: message => handlersRef.current.handleRecoverUpload(message),
            RetryUpload: message => handlersRef.current.handleRetryUpload(message),
            CreateDummyFile: message => handlersRef.current.handleCreateDummyFile(message),
            DismissResumeOverlay: message => handlersRef.current.handleDismissResumeOverlay(message),
            SendBootMetrics: message => handlersRef.current.handleSendBootMetrics(message),
            SetDebugMode: message => handlersRef.current.handleSetDebugMode(message),
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

    return { isIapLoading, showResumeOverlay };
};

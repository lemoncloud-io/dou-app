import { useEffect, useRef } from 'react';
import {
    useAppIconHandler,
    useAppUpdateHandler,
    useConfigKvHandler,
    useCrudCacheHandler,
    useClipboardHandler,
    useHapticHandler,
    useBootSplashHandler,
    useDeviceHandler,
    useSmsHandler,
    useFcmHandler,
    useLogStoreHandler,
    useLogHandler,
    useOAuthHandler,
    usePendingReportHandler,
    usePermissionHandler,
    usePreferenceCacheHandler,
    useSearchCacheHandler,
    useSubscriptionIapHandler,
    useFileTransferHandler,
    useMediaExportHandler,
    useAttachmentPickerHandler,
    useShareIntakeHandler,
    usePhotoLibraryHandler,
    useTestRecordHandler,
    useResumeOverlay,
    useCustomZipHandler,
    useNativeStorageHandler,
    usePerfHandler,
    useUnfurlHandler,
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
 * Messages are not queued: each is handled as it arrives, so a handler that waits on the user
 * (ShareFile on iOS waits for the share sheet to close) holds up no other message.
 *
 * @param props - Dependencies injected from the MainScreen (bridge, navigation, etc.)
 * @returns An object containing the message handler callback and IAP loading state.
 */
export const useWebMessageRouter = ({ bridge }: UseWebMessageRouterProps) => {
    const { showResumeOverlay, dismissOverlay, coverReload } = useResumeOverlay();

    // --- Domain-specific Handlers (memoized with useCallback) ---
    const { handleDismissResumeOverlay } = useAppStateHandler(bridge, dismissOverlay);
    const {
        fetchFcmToken,
        handleDeleteFcmToken,
        handleFetchBadgeCount,
        handleFetchBadgeBase,
        handleSetBadgeCount,
        handleFetchPushMarks,
    } = useFcmHandler(bridge);
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
        handleFetchLastChats,
        handleFetchManyCache,
        handleSaveCache,
        handleSaveAllCache,
        handleDeleteCache,
        handleDeleteAllCache,
        handleClearCache,
        handleClearCacheByChannel,
    } = useCrudCacheHandler();

    const { handleFetchPreference, handleSavePreference, handleDeletePreference } = usePreferenceCacheHandler();
    const { handleSaveConfigValue, handleClearConfigValue } = useConfigKvHandler();
    const { handleSendLog } = useLogHandler();
    const { handleFetchLogUploadQueue, handleAckLogUploadQueue, handleClearLogUploadQueue } = useLogStoreHandler();
    const { handleFetchPendingReports, handleAckPendingReports } = usePendingReportHandler();

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
        handleStartFileTransfer,
        handleCancelFileTransfer,
        handleListFileTransfers,
        handleAckFileTransfers,
        handleWriteTempFile,
    } = useFileTransferHandler(bridge);
    const { canOpenFile, canSaveFile, handleSaveToPhotoLibrary, handleShareFile, handleOpenFile, handleSaveFile } =
        useMediaExportHandler();

    const {
        isAvailable: isAttachmentPickerAvailable,
        canReadVideoFrame,
        handlePickAttachments,
        handlePrepareVideo,
        handleReadAttachment,
        handleReadVideoFrame,
    } = useAttachmentPickerHandler();

    const {
        isAvailable: isShareIntakeAvailable,
        handleFetchShareIntake,
        handleReleaseShareIntake,
    } = useShareIntakeHandler();

    const {
        isAvailable: isPhotoLibraryAvailable,
        canKeepVideo,
        handleListPhotoAlbums,
        handleListPhotos,
        handleReadPhoto,
        handleManagePhotoSelection,
        handleKeepLibraryVideo,
    } = usePhotoLibraryHandler();

    const { handleRequestPermission } = usePermissionHandler();
    const { handleOAuthLogin, handleOAuthLogout } = useOAuthHandler();
    const { handleCheckAppUpdate, handleOpenStore } = useAppUpdateHandler();
    const { handleFetchAppIcon, handleFetchAppIconList, handleChangeAppIcon } = useAppIconHandler();
    const { handleCopyToClipboard } = useClipboardHandler();
    const { handleTriggerHaptic } = useHapticHandler();
    const { handleFirstScreenReady } = useBootSplashHandler();
    const {
        handleSendBootMetrics,
        handleSetDebugMode,
        handleFetchBootRecords,
        handleClearBootRecords,
        handleStartPerfTrace,
        handleStopPerfTrace,
    } = usePerfHandler();
    const { handleApplyCustomZip, handleDisableCustomZip, handleFetchCustomZipStatus } = useCustomZipHandler();
    const { handleFetchUrlMetadata } = useUnfurlHandler();
    const { handleFetchNativeStorageSummary, handleClearNativeCache } = useNativeStorageHandler();

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
        handleDeleteFcmToken,
        handleFetchBadgeCount,
        handleFetchBadgeBase,
        handleSetBadgeCount,
        handleFetchPushMarks,
        handleDismissResumeOverlay,
        handleFirstScreenReady,
        fetchProducts,
        fetchCurrentPurchases,
        handlePurchaseSubscription,
        handleFinishPurchase,
        handleOpenSubscriptionManagement,
        handleFetchCache,
        handleFetchAllCache,
        handleFetchLastChats,
        handleFetchManyCache,
        handleSaveCache,
        handleSaveAllCache,
        handleDeleteCache,
        handleDeleteAllCache,
        handleSearchGlobalCache,
        handleClearCache,
        handleClearCacheByChannel,
        handleFetchPreference,
        handleSavePreference,
        handleDeletePreference,
        handleSaveConfigValue,
        handleClearConfigValue,
        handleSendLog,
        handleFetchLogUploadQueue,
        handleAckLogUploadQueue,
        handleClearLogUploadQueue,
        handleFetchPendingReports,
        handleAckPendingReports,
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
        handleTriggerHaptic,
        handleSendBootMetrics,
        handleSetDebugMode,
        handleFetchBootRecords,
        handleClearBootRecords,
        handleStartPerfTrace,
        handleStopPerfTrace,
        handleApplyCustomZip,
        handleDisableCustomZip,
        handleFetchCustomZipStatus,
        handleFetchNativeStorageSummary,
        handleClearNativeCache,
        handleStartFileTransfer,
        handleCancelFileTransfer,
        handleListFileTransfers,
        handleAckFileTransfers,
        handleWriteTempFile,
        handleSaveToPhotoLibrary,
        handleShareFile,
        handleOpenFile,
        handleSaveFile,
        handlePickAttachments,
        handlePrepareVideo,
        handleReadAttachment,
        handleReadVideoFrame,
        handleFetchShareIntake,
        handleReleaseShareIntake,
        handleListPhotoAlbums,
        handleListPhotos,
        handleReadPhoto,
        handleManagePhotoSelection,
        handleKeepLibraryVideo,
        handleFetchTestRecord,
        handleFetchAllTestRecords,
        handleSaveTestRecord,
        handleSaveAllTestRecords,
        handleClearTestRecords,
        handleFetchUrlMetadata,
    });

    useEffect(() => {
        handlersRef.current = {
            fetchFcmToken,
            handleDeleteFcmToken,
            handleFetchBadgeCount,
            handleFetchBadgeBase,
            handleSetBadgeCount,
            handleFetchPushMarks,
            handleDismissResumeOverlay,
            handleFirstScreenReady,
            fetchProducts,
            fetchCurrentPurchases,
            handlePurchaseSubscription,
            handleFinishPurchase,
            handleOpenSubscriptionManagement,
            handleFetchCache,
            handleFetchAllCache,
            handleFetchLastChats,
            handleFetchManyCache,
            handleSaveCache,
            handleSaveAllCache,
            handleDeleteCache,
            handleDeleteAllCache,
            handleSearchGlobalCache,
            handleClearCache,
            handleClearCacheByChannel,
            handleFetchPreference,
            handleSavePreference,
            handleDeletePreference,
            handleSaveConfigValue,
            handleClearConfigValue,
            handleSendLog,
            handleFetchLogUploadQueue,
            handleAckLogUploadQueue,
            handleClearLogUploadQueue,
            handleFetchPendingReports,
            handleAckPendingReports,
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
            handleTriggerHaptic,
            handleSendBootMetrics,
            handleSetDebugMode,
            handleFetchBootRecords,
            handleClearBootRecords,
            handleStartPerfTrace,
            handleStopPerfTrace,
            handleApplyCustomZip,
            handleDisableCustomZip,
            handleFetchCustomZipStatus,
            handleFetchNativeStorageSummary,
            handleClearNativeCache,
            handleFetchTestRecord,
            handleFetchAllTestRecords,
            handleSaveTestRecord,
            handleSaveAllTestRecords,
            handleClearTestRecords,
            handleStartFileTransfer,
            handleCancelFileTransfer,
            handleListFileTransfers,
            handleAckFileTransfers,
            handleWriteTempFile,
            handleSaveToPhotoLibrary,
            handleShareFile,
            handleOpenFile,
            handleSaveFile,
            handlePickAttachments,
            handlePrepareVideo,
            handleReadAttachment,
            handleReadVideoFrame,
            handleFetchShareIntake,
            handleReleaseShareIntake,
            handleListPhotoAlbums,
            handleListPhotos,
            handleReadPhoto,
            handleManagePhotoSelection,
            handleKeepLibraryVideo,
            handleFetchUrlMetadata,
        };
    });

    useEffect(() => {
        // Builds a routing map that fully supports type inference.
        const handlerMap: {
            [K in WebMessageType]?: (message: WebMessageData<K>) => any;
        } = {
            FetchFcmToken: message => handlersRef.current.fetchFcmToken(message),
            DeleteFcmToken: message => handlersRef.current.handleDeleteFcmToken(message),
            FetchBadgeCount: message => handlersRef.current.handleFetchBadgeCount(message),
            FetchBadgeBase: message => handlersRef.current.handleFetchBadgeBase(message),
            SetBadgeCount: message => handlersRef.current.handleSetBadgeCount(message),
            FetchPushMarks: message => handlersRef.current.handleFetchPushMarks(message),
            FetchProducts: message => handlersRef.current.fetchProducts(message),
            FetchCurrentPurchases: message => handlersRef.current.fetchCurrentPurchases(message),
            Purchase: message => handlersRef.current.handlePurchaseSubscription(message),
            FinishPurchaseTransaction: message => handlersRef.current.handleFinishPurchase(message),
            OpenSubscriptionManagement: message => handlersRef.current.handleOpenSubscriptionManagement(message),
            FetchCacheData: message => handlersRef.current.handleFetchCache(message),
            FetchAllCacheData: message => handlersRef.current.handleFetchAllCache(message),
            FetchLastChatsData: message => handlersRef.current.handleFetchLastChats(message),
            FetchManyCacheData: message => handlersRef.current.handleFetchManyCache(message),
            SaveCacheData: message => handlersRef.current.handleSaveCache(message),
            SaveAllCacheData: message => handlersRef.current.handleSaveAllCache(message),
            DeleteCacheData: message => handlersRef.current.handleDeleteCache(message),
            DeleteAllCacheData: message => handlersRef.current.handleDeleteAllCache(message),
            SearchGlobalCacheData: message => handlersRef.current.handleSearchGlobalCache(message),
            ClearCacheData: message => handlersRef.current.handleClearCache(message),
            ClearCacheDataByChannel: message => handlersRef.current.handleClearCacheByChannel(message),
            FetchTestRecord: message => handlersRef.current.handleFetchTestRecord(message),
            FetchAllTestRecords: message => handlersRef.current.handleFetchAllTestRecords(message),
            SaveTestRecord: message => handlersRef.current.handleSaveTestRecord(message),
            SaveAllTestRecords: message => handlersRef.current.handleSaveAllTestRecords(message),
            ClearTestRecords: message => handlersRef.current.handleClearTestRecords(message),
            FetchPreference: message => handlersRef.current.handleFetchPreference(message),
            SavePreference: message => handlersRef.current.handleSavePreference(message),
            DeletePreference: message => handlersRef.current.handleDeletePreference(message),
            SaveConfigValue: message => handlersRef.current.handleSaveConfigValue(message),
            ClearConfigValue: message => handlersRef.current.handleClearConfigValue(message),
            SendLog: message => handlersRef.current.handleSendLog(message),
            FetchLogUploadQueue: message => handlersRef.current.handleFetchLogUploadQueue(message),
            AckLogUploadQueue: message => handlersRef.current.handleAckLogUploadQueue(message),
            ClearLogUploadQueue: message => handlersRef.current.handleClearLogUploadQueue(message),
            FetchPendingReports: message => handlersRef.current.handleFetchPendingReports(message),
            AckPendingReports: message => handlersRef.current.handleAckPendingReports(message),
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
            TriggerHaptic: message => handlersRef.current.handleTriggerHaptic(message),
            StartFileTransfer: message => handlersRef.current.handleStartFileTransfer(message),
            CancelFileTransfer: message => handlersRef.current.handleCancelFileTransfer(message),
            ListFileTransfers: () => handlersRef.current.handleListFileTransfers(),
            AckFileTransfers: message => handlersRef.current.handleAckFileTransfers(message),
            WriteTempFile: message => handlersRef.current.handleWriteTempFile(message),
            // The web shows save and share only when the handshake lists both names, and the
            // handshake lists what this table registers.
            SaveToPhotoLibrary: message => handlersRef.current.handleSaveToPhotoLibrary(message),
            ShareFile: message => handlersRef.current.handleShareFile(message),
            CreateDummyFile: message => handlersRef.current.handleCreateDummyFile(message),
            DismissResumeOverlay: message => handlersRef.current.handleDismissResumeOverlay(message),
            FirstScreenReady: message => handlersRef.current.handleFirstScreenReady(message),
            SendBootMetrics: message => handlersRef.current.handleSendBootMetrics(message),
            FetchBootRecords: message => handlersRef.current.handleFetchBootRecords(message),
            ClearBootRecords: message => handlersRef.current.handleClearBootRecords(message),
            StartPerfTrace: message => handlersRef.current.handleStartPerfTrace(message),
            StopPerfTrace: message => handlersRef.current.handleStopPerfTrace(message),
            ApplyCustomZip: message => handlersRef.current.handleApplyCustomZip(message),
            DisableCustomZip: message => handlersRef.current.handleDisableCustomZip(message),
            FetchCustomZipStatus: message => handlersRef.current.handleFetchCustomZipStatus(message),
            FetchNativeStorageSummary: message => handlersRef.current.handleFetchNativeStorageSummary(message),
            ClearNativeCache: message => handlersRef.current.handleClearNativeCache(message),
            SetDebugMode: message => handlersRef.current.handleSetDebugMode(message),
            FetchUrlMetadata: message => handlersRef.current.handleFetchUrlMetadata(message),
            // Registered only where the native module exists. A build without it leaves the web its
            // NOT_FOUND, which is the signal to fall back to the page's own file input.
            ...(isPhotoLibraryAvailable && {
                ListPhotoAlbums: message => handlersRef.current.handleListPhotoAlbums(message),
                ListPhotos: message => handlersRef.current.handleListPhotos(message),
                ReadPhoto: message => handlersRef.current.handleReadPhoto(message),
                ManagePhotoSelection: () => handlersRef.current.handleManagePhotoSelection(),
            }),
            // The same rule for the attachment picker, and for the two export calls an older
            // MediaExport module lacks: the web learns from NOT_FOUND that this shell cannot, and
            // uses its own file input, or offers the share sheet, instead.
            ...(isAttachmentPickerAvailable && {
                PickAttachments: message => handlersRef.current.handlePickAttachments(message),
                PrepareVideo: message => handlersRef.current.handlePrepareVideo(message),
                ReadAttachment: message => handlersRef.current.handleReadAttachment(message),
            }),
            // Newer than the modules they live on, so registered by method: a build whose module lacks
            // one leaves the web its NOT_FOUND — the grid then lists photos only, and a received video's
            // tile is drawn another way or left grey.
            ...(isPhotoLibraryAvailable &&
                canKeepVideo && {
                    KeepLibraryVideo: message => handlersRef.current.handleKeepLibraryVideo(message),
                }),
            ...(isAttachmentPickerAvailable &&
                canReadVideoFrame && {
                    ReadVideoFrame: message => handlersRef.current.handleReadVideoFrame(message),
                }),
            ...(isShareIntakeAvailable && {
                FetchShareIntake: message => handlersRef.current.handleFetchShareIntake(message),
                ReleaseShareIntake: message => handlersRef.current.handleReleaseShareIntake(message),
            }),
            ...(canOpenFile && { OpenFile: message => handlersRef.current.handleOpenFile(message) }),
            ...(canSaveFile && { SaveFile: message => handlersRef.current.handleSaveFile(message) }),
        };

        // Register handlers with the bridge
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
        };
    }, [
        bridge,
        isPhotoLibraryAvailable,
        isAttachmentPickerAvailable,
        isShareIntakeAvailable,
        canKeepVideo,
        canReadVideoFrame,
        canOpenFile,
        canSaveFile,
    ]);

    return { isIapLoading, showResumeOverlay, coverReload };
};

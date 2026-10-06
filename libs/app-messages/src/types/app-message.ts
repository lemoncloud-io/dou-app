import type {
    OnAckPendingReportsPayload,
    OnBackgroundStatusChangedPayload,
    OnBackPressedPayload,
    OnChangeAppIconPayload,
    OnCheckAppUpdatePayload,
    OnClearAppLogBufferPayload,
    OnClearCacheDataByChannelPayload,
    OnClearCacheDataPayload,
    OnClearConfigValuePayload,
    OnClearTestRecordsPayload,
    OnCloseModalPayload,
    OnCreateDummyFilePayload,
    OnDeleteAllCacheDataPayload,
    OnDeleteCacheDataPayload,
    OnDeletePreferencePayload,
    OnFetchAllCacheDataPayload,
    OnFetchAllTestRecordsPayload,
    OnFetchAppIconListPayload,
    OnFetchAppIconPayload,
    OnFetchAppLogBufferPayload,
    OnFetchAppLogBufferSizePayload,
    OnFetchBadgeBasePayload,
    OnFetchBadgeCountPayload,
    OnFetchPushMarksPayload,
    OnFetchCacheDataPayload,
    OnFetchLastChatsDataPayload,
    OnFetchManyCacheDataPayload,
    OnFetchCurrentPurchasesPayload,
    OnFetchFcmTokenPayload,
    OnAckLogUploadQueuePayload,
    OnClearLogUploadQueuePayload,
    OnFetchLogUploadQueuePayload,
    OnFetchPendingReportsPayload,
    OnFetchPreferencePayload,
    OnFetchProductsPayload,
    OnFetchSafeAreaPayload,
    OnFetchTestRecordPayload,
    OnFinishPurchaseTransactionPayload,
    OnGetContactsPayload,
    OnNotificationPayload,
    OnOAuthLoginPayload,
    OnOAuthLogoutPayload,
    OnOpenCameraPayload,
    OnOpenDocumentPayload,
    OnOpenModalPayload,
    OnOpenPhotoLibraryPayload,
    OnOpenSettingsPayload,
    OnOpenShareSheetPayload,
    OnOpenStorePayload,
    OnOpenSubscriptionManagementPayload,
    OnOpenURLPayload,
    OnNavigatePayload,
    OnDismissResumeOverlayPayload,
    OnFirstScreenReadyPayload,
    OnWebAppReadyPayload,
    OnShowLoaderPayload,
    OnHideLoaderPayload,
    OnSyncCredentialPayload,
    OnPopWebViewPayload,
    OnPollAppLogBufferPayload,
    OnPurchaseErrorPayload,
    OnPurchasePayload,
    OnPurchaseSuccessPayload,
    OnRequestPermissionPayload,
    OnSaveAllCacheDataPayload,
    OnSaveAllTestRecordsPayload,
    OnSaveCacheDataPayload,
    OnApplyCustomZipPayload,
    OnClearBootRecordsPayload,
    OnDeleteFcmTokenPayload,
    OnDisableCustomZipPayload,
    OnFetchBootRecordsPayload,
    OnFetchCustomZipStatusPayload,
    OnSaveConfigValuePayload,
    OnSavePreferencePayload,
    OnSaveTestRecordPayload,
    OnSearchGlobalCacheDataPayload,
    OnSendLogPayload,
    OnSendSmsPayload,
    OnSetBadgeCountPayload,
    OnShowNotificationPayload,
    OnFetchUrlMetadataPayload,
    OnSetCanGoBackPayload,
    OnUpdateDeviceInfoPayload,
    PongPayload,
    OnStartFileTransferPayload,
    OnCancelFileTransferPayload,
    OnListFileTransfersPayload,
    OnAckFileTransfersPayload,
    OnWriteTempFilePayload,
    OnListPhotoAlbumsPayload,
    OnListPhotosPayload,
    OnReadPhotoPayload,
    OnKeepLibraryVideoPayload,
    OnManagePhotoSelectionPayload,
    OnSaveToPhotoLibraryPayload,
    OnShareFilePayload,
    OnOpenFilePayload,
    OnSaveFilePayload,
    OnPickAttachmentsPayload,
    OnPrepareVideoPayload,
    OnReadAttachmentPayload,
    OnReadVideoFramePayload,
    OnFileTransferStatePayload,
    OnCopyToClipboardPayload,
    OnTriggerHapticPayload,
    OnUpdateStatusPayload,
    OnStartUpdateDownloadPayload,
    OnRestartToUpdatePayload,
    OnSendBootMetricsPayload,
    OnSetDebugModePayload,
    OnStartPerfTracePayload,
    OnStopPerfTracePayload,
} from './model';
import type { BaseMessage } from './types';

// ======================================================================
// Message Data Map Definition
// ======================================================================
/** Structure that maps each message type to its corresponding Data (Payload) type. */
export type AppMessageDataMap = {
    // 1. Device & System
    OnUpdateDeviceInfo: OnUpdateDeviceInfoPayload;
    OnFetchSafeArea: OnFetchSafeAreaPayload;
    OnBackgroundStatusChanged: OnBackgroundStatusChangedPayload;
    OnSetCanGoBack: OnSetCanGoBackPayload;
    OnOpenModal: OnOpenModalPayload;
    OnCloseModal: OnCloseModalPayload;
    OnOpenSettings: OnOpenSettingsPayload;
    OnOpenShareSheet: OnOpenShareSheetPayload;
    OnFileTransferState: OnFileTransferStatePayload;
    OnCreateDummyFile: OnCreateDummyFilePayload;
    OnStartFileTransfer: OnStartFileTransferPayload;
    OnCancelFileTransfer: OnCancelFileTransferPayload;
    OnListFileTransfers: OnListFileTransfersPayload;
    OnAckFileTransfers: OnAckFileTransfersPayload;
    OnWriteTempFile: OnWriteTempFilePayload;
    OnBackPressed: OnBackPressedPayload;
    OnOpenDocument: OnOpenDocumentPayload;
    OnGetContacts: OnGetContactsPayload;
    OnOpenCamera: OnOpenCameraPayload;
    OnOpenPhotoLibrary: OnOpenPhotoLibraryPayload;
    OnListPhotoAlbums: OnListPhotoAlbumsPayload;
    OnListPhotos: OnListPhotosPayload;
    OnReadPhoto: OnReadPhotoPayload;
    OnKeepLibraryVideo: OnKeepLibraryVideoPayload;
    OnManagePhotoSelection: OnManagePhotoSelectionPayload;
    OnSaveToPhotoLibrary: OnSaveToPhotoLibraryPayload;
    OnShareFile: OnShareFilePayload;
    OnOpenFile: OnOpenFilePayload;
    OnSaveFile: OnSaveFilePayload;
    OnPickAttachments: OnPickAttachmentsPayload;
    OnPrepareVideo: OnPrepareVideoPayload;
    OnReadAttachment: OnReadAttachmentPayload;
    OnReadVideoFrame: OnReadVideoFramePayload;
    OnRequestPermission: OnRequestPermissionPayload;
    OnOpenURL: OnOpenURLPayload;
    OnNavigate: OnNavigatePayload;
    OnDismissResumeOverlay: OnDismissResumeOverlayPayload;
    OnFirstScreenReady: OnFirstScreenReadyPayload;
    OnSendSms: OnSendSmsPayload;
    OnFetchAppIcon: OnFetchAppIconPayload;
    OnFetchAppIconList: OnFetchAppIconListPayload;
    OnChangeAppIcon: OnChangeAppIconPayload;
    Pong: PongPayload;

    // 2. Notification
    OnFetchFcmToken: OnFetchFcmTokenPayload;
    OnReceiveNotification: OnNotificationPayload;
    OnFetchBadgeCount: OnFetchBadgeCountPayload;
    OnFetchBadgeBase: OnFetchBadgeBasePayload;
    OnFetchPushMarks: OnFetchPushMarksPayload;
    OnSetBadgeCount: OnSetBadgeCountPayload;
    OnShowNotification: OnShowNotificationPayload;
    OnFetchUrlMetadata: OnFetchUrlMetadataPayload;

    // 3. IAP
    OnFetchCurrentPurchases: OnFetchCurrentPurchasesPayload;
    OnFetchProducts: OnFetchProductsPayload;
    OnPurchase: OnPurchasePayload;
    OnPurchaseSuccess: OnPurchaseSuccessPayload;
    OnPurchaseError: OnPurchaseErrorPayload;
    OnFinishPurchaseTransaction: OnFinishPurchaseTransactionPayload;
    OnOpenSubscriptionManagement: OnOpenSubscriptionManagementPayload;

    // 4. Cache
    OnFetchAllCacheData: OnFetchAllCacheDataPayload;
    OnFetchCacheData: OnFetchCacheDataPayload;
    OnFetchManyCacheData: OnFetchManyCacheDataPayload;
    OnFetchLastChatsData: OnFetchLastChatsDataPayload;
    OnSaveCacheData: OnSaveCacheDataPayload;
    OnSaveAllCacheData: OnSaveAllCacheDataPayload;
    OnDeleteCacheData: OnDeleteCacheDataPayload;
    OnDeleteAllCacheData: OnDeleteAllCacheDataPayload;
    OnClearCacheData: OnClearCacheDataPayload;
    OnClearCacheDataByChannel: OnClearCacheDataByChannelPayload;
    OnSearchGlobalCacheData: OnSearchGlobalCacheDataPayload;

    // 5. Preference
    OnFetchPreference: OnFetchPreferencePayload;
    OnSavePreference: OnSavePreferencePayload;
    OnDeletePreference: OnDeletePreferencePayload;

    // 6. Auth
    OnOAuthLogin: OnOAuthLoginPayload;
    OnOAuthLogout: OnOAuthLogoutPayload;

    // 6.5 Config (ADR-0079 shell lane — general-purpose KV bridge)
    OnSaveConfigValue: OnSaveConfigValuePayload;
    OnClearConfigValue: OnClearConfigValuePayload;

    // 6.6 Debug panel (ADR-0080 decision 11)
    OnDeleteFcmToken: OnDeleteFcmTokenPayload;
    OnFetchBootRecords: OnFetchBootRecordsPayload;
    OnClearBootRecords: OnClearBootRecordsPayload;
    OnApplyCustomZip: OnApplyCustomZipPayload;
    OnDisableCustomZip: OnDisableCustomZipPayload;
    OnFetchCustomZipStatus: OnFetchCustomZipStatusPayload;

    // 7. Common & Others
    OnWebAppReady: OnWebAppReadyPayload;
    OnShowLoader: OnShowLoaderPayload;
    OnHideLoader: OnHideLoaderPayload;
    OnSyncCredential: OnSyncCredentialPayload;
    OnPopWebView: OnPopWebViewPayload;
    OnFetchAppLogBuffer: OnFetchAppLogBufferPayload;
    OnPollAppLogBuffer: OnPollAppLogBufferPayload;
    OnClearAppLogBuffer: OnClearAppLogBufferPayload;
    OnFetchAppLogBufferSize: OnFetchAppLogBufferSizePayload;
    OnSendLog: OnSendLogPayload;
    OnFetchLogUploadQueue: OnFetchLogUploadQueuePayload;
    OnAckLogUploadQueue: OnAckLogUploadQueuePayload;
    OnClearLogUploadQueue: OnClearLogUploadQueuePayload;
    OnFetchPendingReports: OnFetchPendingReportsPayload;
    OnAckPendingReports: OnAckPendingReportsPayload;
    OnCopyToClipboard: OnCopyToClipboardPayload;
    OnTriggerHaptic: OnTriggerHapticPayload;
    OnSendBootMetrics: OnSendBootMetricsPayload;
    OnSetDebugMode: OnSetDebugModePayload;
    OnStartPerfTrace: OnStartPerfTracePayload;
    OnStopPerfTrace: OnStopPerfTracePayload;

    // 8. Test DB Scenario Validation
    OnFetchTestRecord: OnFetchTestRecordPayload;
    OnFetchAllTestRecords: OnFetchAllTestRecordsPayload;
    OnSaveTestRecord: OnSaveTestRecordPayload;
    OnSaveAllTestRecords: OnSaveAllTestRecordsPayload;
    OnClearTestRecords: OnClearTestRecordsPayload;

    // 9. Auto Update (desktop)
    OnUpdateStatus: OnUpdateStatusPayload;
    OnStartUpdateDownload: OnStartUpdateDownloadPayload;
    OnRestartToUpdate: OnRestartToUpdatePayload;

    // 10. App Update (mobile)
    OnCheckAppUpdate: OnCheckAppUpdatePayload;
    OnOpenStore: OnOpenStorePayload;
};

export type AppMessageType = keyof AppMessageDataMap;

// ======================================================================
// App Message Core Interfaces & Types
// ======================================================================
export type AppMessageError = {
    code: string;
    message: string;
    details?: unknown;
};

/**
 * Success response type used when request() resolves.
 * success is fixed to true so strict handler/request types can narrow the success payload precisely.
 */
export type AppSuccessMessage<T extends AppMessageType> = BaseMessage & {
    type: T;
    success: true;
    data: AppMessageDataMap[T];
    error?: never;
};

/** AppMessage-family error response used when a handler or wire response represents a failure state. */
export type AppFailureMessage<T extends AppMessageType = AppMessageType> = BaseMessage & {
    type: T;
    success: false;
    error: AppMessageError;
    data?: Partial<AppMessageDataMap[T]>;
};

export type AppResponseMessage<T extends AppMessageType = AppMessageType> = AppSuccessMessage<T> | AppFailureMessage<T>;

export type AppDefaultMessage<T extends AppMessageType> = BaseMessage & {
    type: T;
    success: boolean;
    error?: AppMessageError;
    data: AppMessageDataMap[T];
};

export type AppMessageData<T extends AppMessageType> = AppDefaultMessage<T>;

export type AppMessage = {
    [K in AppMessageType]: AppDefaultMessage<K>;
}[AppMessageType];

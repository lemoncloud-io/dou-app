import type {
    OnAckPendingReportsPayload,
    OnBackgroundStatusChangedPayload,
    OnBackPressedPayload,
    OnChangeAppIconPayload,
    OnCheckAppUpdatePayload,
    OnClearCacheDataByChannelPayload,
    OnClearCacheDataPayload,
    OnClearConfigValuePayload,
    OnClearTestRecordsPayload,
    OnCreateDummyFilePayload,
    OnDeleteAllCacheDataPayload,
    OnDeleteCacheDataPayload,
    OnDeletePreferencePayload,
    OnFetchAllCacheDataPayload,
    OnFetchAllTestRecordsPayload,
    OnFetchAppIconListPayload,
    OnFetchAppIconPayload,
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
    OnFetchTestRecordPayload,
    OnFinishPurchaseTransactionPayload,
    OnGetContactsPayload,
    OnNotificationPayload,
    OnOAuthLoginPayload,
    OnOAuthLogoutPayload,
    OnOpenCameraPayload,
    OnOpenDocumentPayload,
    OnOpenPhotoLibraryPayload,
    OnOpenSettingsPayload,
    OnOpenShareSheetPayload,
    OnOpenStorePayload,
    OnOpenSubWebViewPayload,
    OnCloseSubWebViewPayload,
    OnSubWebViewClosedPayload,
    OnFinishSubWebViewPayload,
    OnSetSubWebViewTitlePayload,
    OnGetSubWebViewUserKeyPayload,
    OnSetSubWebViewCloseGuardPayload,
    OnReportSubWebViewErrorPayload,
    OnGetSubWebViewStoragePayload,
    OnSetSubWebViewStoragePayload,
    OnRemoveSubWebViewStoragePayload,
    OnClearSubWebViewStoragePayload,
    OnGetSubWebViewStorageInfoPayload,
    OnGetSubWebViewPermissionPayload,
    OnRequestSubWebViewPermissionPayload,
    OnSubWebViewCloseRequestedPayload,
    OnSubWebViewContextChangedPayload,
    OnOpenSubscriptionManagementPayload,
    OnOpenURLPayload,
    OnNavigatePayload,
    OnDismissResumeOverlayPayload,
    OnFirstScreenReadyPayload,
    OnWebAppReadyPayload,
    OnPurchaseErrorPayload,
    OnPurchasePayload,
    OnPurchaseSuccessPayload,
    OnRequestPermissionPayload,
    OnSaveAllCacheDataPayload,
    OnSaveAllTestRecordsPayload,
    OnSaveCacheDataPayload,
    OnApplyCustomZipPayload,
    OnClearBootRecordsPayload,
    OnClearNativeCachePayload,
    OnDeleteFcmTokenPayload,
    OnDisableCustomZipPayload,
    OnFetchBootRecordsPayload,
    OnFetchNativeStorageSummaryPayload,
    OnFetchCustomZipStatusPayload,
    OnSaveConfigValuePayload,
    OnSavePreferencePayload,
    OnSaveTestRecordPayload,
    OnSearchGlobalCacheDataPayload,
    OnFetchChatMediaCacheDataPayload,
    OnCountChatMediaCacheDataPayload,
    OnSaveChatMediaCacheDataPayload,
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
    OnAudioRecordingStartedPayload,
    OnAudioRecordingEndedPayload,
    OnFetchShareIntakePayload,
    OnReleaseShareIntakePayload,
    OnStorageClearPayload,
    OnStorageGetPayload,
    OnStorageSavePayload,
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
    OnRuntimeCallPayload,
    OnRuntimeEventPayload,
    OnRuntimeHelloPayload,
    OnRuntimeSessionChangedPayload,
    OnRuntimeSubscribePayload,
    OnRuntimeUnsubscribePayload,
    OnFetchSessionOwnerPayload,
    OnSetSessionOwnerPayload,
    OnSetDefaultSessionOwnerPayload,
} from './model';
import type { BaseMessage } from './types';

export type AppMessageDataMap = {
    OnUpdateDeviceInfo: OnUpdateDeviceInfoPayload;
    OnBackgroundStatusChanged: OnBackgroundStatusChangedPayload;
    OnSetCanGoBack: OnSetCanGoBackPayload;
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
    OnAudioRecordingStarted: OnAudioRecordingStartedPayload;
    OnAudioRecordingEnded: OnAudioRecordingEndedPayload;
    OnFetchShareIntake: OnFetchShareIntakePayload;
    OnReleaseShareIntake: OnReleaseShareIntakePayload;
    OnStorageGet: OnStorageGetPayload;
    OnStorageSave: OnStorageSavePayload;
    OnStorageClear: OnStorageClearPayload;
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

    OnFetchFcmToken: OnFetchFcmTokenPayload;
    OnReceiveNotification: OnNotificationPayload;
    OnFetchBadgeCount: OnFetchBadgeCountPayload;
    OnFetchBadgeBase: OnFetchBadgeBasePayload;
    OnFetchPushMarks: OnFetchPushMarksPayload;
    OnSetBadgeCount: OnSetBadgeCountPayload;
    OnShowNotification: OnShowNotificationPayload;
    OnFetchUrlMetadata: OnFetchUrlMetadataPayload;

    OnFetchCurrentPurchases: OnFetchCurrentPurchasesPayload;
    OnFetchProducts: OnFetchProductsPayload;
    OnPurchase: OnPurchasePayload;
    OnPurchaseSuccess: OnPurchaseSuccessPayload;
    OnPurchaseError: OnPurchaseErrorPayload;
    OnFinishPurchaseTransaction: OnFinishPurchaseTransactionPayload;
    OnOpenSubscriptionManagement: OnOpenSubscriptionManagementPayload;

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
    OnFetchChatMediaCacheData: OnFetchChatMediaCacheDataPayload;
    OnCountChatMediaCacheData: OnCountChatMediaCacheDataPayload;
    OnSaveChatMediaCacheData: OnSaveChatMediaCacheDataPayload;

    OnFetchPreference: OnFetchPreferencePayload;
    OnSavePreference: OnSavePreferencePayload;
    OnDeletePreference: OnDeletePreferencePayload;

    OnOAuthLogin: OnOAuthLoginPayload;
    OnOAuthLogout: OnOAuthLogoutPayload;

    OnSaveConfigValue: OnSaveConfigValuePayload;
    OnClearConfigValue: OnClearConfigValuePayload;

    OnDeleteFcmToken: OnDeleteFcmTokenPayload;
    OnFetchBootRecords: OnFetchBootRecordsPayload;
    OnClearBootRecords: OnClearBootRecordsPayload;
    OnApplyCustomZip: OnApplyCustomZipPayload;
    OnDisableCustomZip: OnDisableCustomZipPayload;
    OnFetchCustomZipStatus: OnFetchCustomZipStatusPayload;
    OnFetchNativeStorageSummary: OnFetchNativeStorageSummaryPayload;
    OnClearNativeCache: OnClearNativeCachePayload;

    OnWebAppReady: OnWebAppReadyPayload;
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

    OnFetchTestRecord: OnFetchTestRecordPayload;
    OnFetchAllTestRecords: OnFetchAllTestRecordsPayload;
    OnSaveTestRecord: OnSaveTestRecordPayload;
    OnSaveAllTestRecords: OnSaveAllTestRecordsPayload;
    OnClearTestRecords: OnClearTestRecordsPayload;

    OnUpdateStatus: OnUpdateStatusPayload;
    OnStartUpdateDownload: OnStartUpdateDownloadPayload;
    OnRestartToUpdate: OnRestartToUpdatePayload;

    OnCheckAppUpdate: OnCheckAppUpdatePayload;
    OnOpenStore: OnOpenStorePayload;

    OnOpenSubWebView: OnOpenSubWebViewPayload;
    OnCloseSubWebView: OnCloseSubWebViewPayload;
    OnSubWebViewClosed: OnSubWebViewClosedPayload;
    OnFinishSubWebView: OnFinishSubWebViewPayload;
    OnSetSubWebViewTitle: OnSetSubWebViewTitlePayload;
    OnGetSubWebViewUserKey: OnGetSubWebViewUserKeyPayload;
    OnSetSubWebViewCloseGuard: OnSetSubWebViewCloseGuardPayload;
    OnReportSubWebViewError: OnReportSubWebViewErrorPayload;
    OnGetSubWebViewStorage: OnGetSubWebViewStoragePayload;
    OnSetSubWebViewStorage: OnSetSubWebViewStoragePayload;
    OnRemoveSubWebViewStorage: OnRemoveSubWebViewStoragePayload;
    OnClearSubWebViewStorage: OnClearSubWebViewStoragePayload;
    OnGetSubWebViewStorageInfo: OnGetSubWebViewStorageInfoPayload;
    OnGetSubWebViewPermission: OnGetSubWebViewPermissionPayload;
    OnRequestSubWebViewPermission: OnRequestSubWebViewPermissionPayload;
    OnSubWebViewContextChanged: OnSubWebViewContextChangedPayload;
    OnSubWebViewCloseRequested: OnSubWebViewCloseRequestedPayload;
    OnRuntimeHello: OnRuntimeHelloPayload;
    OnRuntimeCall: OnRuntimeCallPayload;
    OnRuntimeSubscribe: OnRuntimeSubscribePayload;
    OnRuntimeUnsubscribe: OnRuntimeUnsubscribePayload;
    OnRuntimeEvent: OnRuntimeEventPayload;
    OnRuntimeSessionChanged: OnRuntimeSessionChangedPayload;
    OnFetchSessionOwner: OnFetchSessionOwnerPayload;
    OnSetSessionOwner: OnSetSessionOwnerPayload;
    OnSetDefaultSessionOwner: OnSetDefaultSessionOwnerPayload;
};

export type AppMessageType = keyof AppMessageDataMap;

export type AppMessageError = {
    code: string;
    message: string;
    details?: unknown;
};

export type AppSuccessMessage<T extends AppMessageType> = BaseMessage & {
    type: T;
    success: true;
    data: AppMessageDataMap[T];
    error?: never;
};

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

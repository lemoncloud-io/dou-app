import type {
    OnBackgroundStatusChangedPayload,
    OnBackPressedPayload,
    OnChangeAppIconPayload,
    OnClearAppLogBufferPayload,
    OnClearCacheDataPayload,
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
    OnFetchBadgeCountPayload,
    OnFetchCacheDataPayload,
    OnFetchCurrentPurchasesPayload,
    OnFetchFcmTokenPayload,
    OnFetchPreferencePayload,
    OnFetchProductsPayload,
    OnFetchSafeAreaPayload,
    OnFetchTestRecordPayload,
    OnFinishPurchaseTransactionPayload,
    OnGetContactsPayload,
    OnListRecoverableUploadsPayload,
    OnNotificationPayload,
    OnOAuthLoginPayload,
    OnOAuthLogoutPayload,
    OnOpenCameraPayload,
    OnOpenDocumentPayload,
    OnOpenModalPayload,
    OnOpenPhotoLibraryPayload,
    OnOpenSettingsPayload,
    OnOpenShareSheetPayload,
    OnOpenSubscriptionManagementPayload,
    OnOpenURLPayload,
    OnNavigatePayload,
    OnDismissResumeOverlayPayload,
    OnWebAppReadyPayload,
    OnShowLoaderPayload,
    OnHideLoaderPayload,
    OnSyncCredentialPayload,
    OnPopWebViewPayload,
    OnPollAppLogBufferPayload,
    OnPurchaseErrorPayload,
    OnPurchasePayload,
    OnPurchaseSuccessPayload,
    OnRecoverUploadPayload,
    OnRequestFileUploadPayload,
    OnPauseFileUploadPayload,
    OnResumeFileUploadPayload,
    OnCancelFileUploadPayload,
    OnRequestPermissionPayload,
    OnRetryUploadPayload,
    OnSaveAllCacheDataPayload,
    OnSaveAllTestRecordsPayload,
    OnSaveCacheDataPayload,
    OnSavePreferencePayload,
    OnSaveTestRecordPayload,
    OnSearchGlobalCacheDataPayload,
    OnSendLogPayload,
    OnSendSmsPayload,
    OnSetBadgeCountPayload,
    OnSetNotificationPrefsPayload,
    OnShowNotificationPayload,
    OnFetchUrlMetadataPayload,
    OnSetCanGoBackPayload,
    OnUpdateDeviceInfoPayload,
    OnUploadCompletePayload,
    OnUploadProgressPayload,
    PongPayload,
    OnCopyToClipboardPayload,
    OnUpdateStatusPayload,
    OnStartUpdateDownloadPayload,
    OnRestartToUpdatePayload,
} from './model';
import type { BaseMessage } from './types';

// ======================================================================
// Message Data Map Definition
// ======================================================================
/** 메시지 타입과 해당 Data(Payload) 타입을 매핑하는 구조입니다. */
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
    OnUploadProgress: OnUploadProgressPayload;
    OnUploadComplete: OnUploadCompletePayload;
    OnListRecoverableUploads: OnListRecoverableUploadsPayload;
    OnRecoverUpload: OnRecoverUploadPayload;
    OnRetryUpload: OnRetryUploadPayload;
    OnCreateDummyFile: OnCreateDummyFilePayload;
    OnRequestFileUpload: OnRequestFileUploadPayload;
    OnPauseFileUpload: OnPauseFileUploadPayload;
    OnResumeFileUpload: OnResumeFileUploadPayload;
    OnCancelFileUpload: OnCancelFileUploadPayload;
    OnBackPressed: OnBackPressedPayload;
    OnOpenDocument: OnOpenDocumentPayload;
    OnGetContacts: OnGetContactsPayload;
    OnOpenCamera: OnOpenCameraPayload;
    OnOpenPhotoLibrary: OnOpenPhotoLibraryPayload;
    OnRequestPermission: OnRequestPermissionPayload;
    OnOpenURL: OnOpenURLPayload;
    OnNavigate: OnNavigatePayload;
    OnDismissResumeOverlay: OnDismissResumeOverlayPayload;
    OnSendSms: OnSendSmsPayload;
    OnFetchAppIcon: OnFetchAppIconPayload;
    OnFetchAppIconList: OnFetchAppIconListPayload;
    OnChangeAppIcon: OnChangeAppIconPayload;
    Pong: PongPayload;

    // 2. Notification
    OnFetchFcmToken: OnFetchFcmTokenPayload;
    OnReceiveNotification: OnNotificationPayload;
    OnFetchBadgeCount: OnFetchBadgeCountPayload;
    OnSetBadgeCount: OnSetBadgeCountPayload;
    OnSetNotificationPrefs: OnSetNotificationPrefsPayload;
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
    OnSaveCacheData: OnSaveCacheDataPayload;
    OnSaveAllCacheData: OnSaveAllCacheDataPayload;
    OnDeleteCacheData: OnDeleteCacheDataPayload;
    OnDeleteAllCacheData: OnDeleteAllCacheDataPayload;
    OnClearCacheData: OnClearCacheDataPayload;
    OnSearchGlobalCacheData: OnSearchGlobalCacheDataPayload;

    // 5. Preference
    OnFetchPreference: OnFetchPreferencePayload;
    OnSavePreference: OnSavePreferencePayload;
    OnDeletePreference: OnDeletePreferencePayload;

    // 6. Auth
    OnOAuthLogin: OnOAuthLoginPayload;
    OnOAuthLogout: OnOAuthLogoutPayload;

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
    OnCopyToClipboard: OnCopyToClipboardPayload;

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
 * request()가 resolve할 때 사용하는 성공 응답 타입입니다.
 * strict handler/request 타입에서 성공 payload를 정확히 좁히기 위해 success: true로 고정합니다.
 */
export type AppSuccessMessage<T extends AppMessageType> = BaseMessage & {
    type: T;
    success: true;
    data: AppMessageDataMap[T];
    error?: never;
};

/** handler 또는 wire 응답이 실패 상태를 표현할 때 사용하는 AppMessage 계열 에러 응답입니다. */
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

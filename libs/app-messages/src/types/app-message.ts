import type {
    OnBackgroundStatusChangedPayload,
    OnBackPressedPayload,
    OnChangeAppIconPayload,
    OnClearAppLogBufferPayload,
    OnClearCacheDataPayload,
    OnClearTestRecordsPayload,
    OnCloseModalPayload,
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
    OnPollAppLogBufferPayload,
    OnPurchaseErrorPayload,
    OnPurchasePayload,
    OnPurchaseSuccessPayload,
    OnRecoverUploadPayload,
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
    OnSetCanGoBackPayload,
    OnUpdateDeviceInfoPayload,
    OnUploadCompletePayload,
    OnUploadProgressPayload,
    PongPayload,
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
    OnBackPressed: OnBackPressedPayload;
    OnOpenDocument: OnOpenDocumentPayload;
    OnGetContacts: OnGetContactsPayload;
    OnOpenCamera: OnOpenCameraPayload;
    OnOpenPhotoLibrary: OnOpenPhotoLibraryPayload;
    OnRequestPermission: OnRequestPermissionPayload;
    OnOpenURL: OnOpenURLPayload;
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
    OnFetchAppLogBuffer: OnFetchAppLogBufferPayload;
    OnPollAppLogBuffer: OnPollAppLogBufferPayload;
    OnClearAppLogBuffer: OnClearAppLogBufferPayload;
    OnFetchAppLogBufferSize: OnFetchAppLogBufferSizePayload;
    OnSendLog: OnSendLogPayload;

    // 8. Test DB Scenario Validation
    OnFetchTestRecord: OnFetchTestRecordPayload;
    OnFetchAllTestRecords: OnFetchAllTestRecordsPayload;
    OnSaveTestRecord: OnSaveTestRecordPayload;
    OnSaveAllTestRecords: OnSaveAllTestRecordsPayload;
    OnClearTestRecords: OnClearTestRecordsPayload;
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

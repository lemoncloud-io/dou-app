import type {
    OnBackgroundStatusChangedPayload,
    OnChangeAppIconPayload,
    OnClearAppLogBufferPayload,
    OnClearCacheDataPayload,
    OnClearTestRecordsPayload,
    OnDeleteAllCacheDataPayload,
    OnDeleteCacheDataPayload,
    OnDeletePreferencePayload,
    OnFetchAllCacheDataPayload,
    OnFetchAllTestRecordsPayload,
    OnFetchAppIconListPayload,
    OnFetchAppIconPayload,
    OnFetchAppLogBufferPayload,
    OnFetchAppLogBufferSizePayload,
    OnFetchCacheDataPayload,
    OnFetchCurrentPurchasesPayload,
    OnFetchFcmTokenPayload,
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
    OnOpenPhotoLibraryPayload,
    OnOpenShareSheetPayload,
    OnPollAppLogBufferPayload,
    OnPurchaseErrorPayload,
    OnPurchaseSuccessPayload,
    OnRequestPermissionPayload,
    OnSendSmsPayload,
    OnSaveAllCacheDataPayload,
    OnSaveAllTestRecordsPayload,
    OnSaveCacheDataPayload,
    OnSavePreferencePayload,
    OnSaveTestRecordPayload,
    OnSearchGlobalCacheDataPayload,
    OnUpdateDeviceInfoPayload,
    PongPayload,
    OnUploadProgressPayload,
    OnUploadCompletePayload,
} from './model';
import type { BaseMessage } from './types';

// ======================================================================
// Message Types
// ======================================================================
export const AppMessageTypes = {
    // 1. Device & System
    OnUpdateDeviceInfo: 'OnUpdateDeviceInfo',
    OnFetchSafeArea: 'OnFetchSafeArea',
    OnBackgroundStatusChanged: 'OnBackgroundStatusChanged',
    OnSetCanGoBack: 'OnSetCanGoBack',
    OnOpenModal: 'OnOpenModal',
    OnCloseModal: 'OnCloseModal',
    OnOpenSettings: 'OnOpenSettings',
    OnOpenShareSheet: 'OnOpenShareSheet',
    OnBackPressed: 'OnBackPressed',
    OnOpenDocument: 'OnOpenDocument',
    OnGetContacts: 'OnGetContacts',
    OnOpenCamera: 'OnOpenCamera',
    OnOpenPhotoLibrary: 'OnOpenPhotoLibrary',
    OnRequestPermission: 'OnRequestPermission',
    OnOpenURL: 'OnOpenURL',
    OnSendSms: 'OnSendSms',
    OnFetchAppIcon: 'OnFetchAppIcon',
    OnFetchAppIconList: 'OnFetchAppIconList',
    OnChangeAppIcon: 'OnChangeAppIcon',
    Pong: 'Pong',
    OnUploadProgress: 'OnUploadProgress',
    OnUploadComplete: 'OnUploadComplete',

    // 2. Notification
    OnFetchFcmToken: 'OnFetchFcmToken',
    OnReceiveNotification: 'OnReceiveNotification',
    OnOpenNotification: 'OnOpenNotification',

    // 3. IAP
    OnFetchCurrentPurchases: 'OnFetchCurrentPurchases',
    OnFetchProducts: 'OnFetchProducts',
    OnPurchase: 'OnPurchase',
    OnPurchaseSuccess: 'OnPurchaseSuccess',
    OnPurchaseError: 'OnPurchaseError',
    OnFinishPurchaseTransaction: 'OnFinishPurchaseTransaction',
    OnOpenSubscriptionManagement: 'OnOpenSubscriptionManagement',

    // 4. CacheData
    OnFetchAllCacheData: 'OnFetchAllCacheData',
    OnFetchCacheData: 'OnFetchCacheData',
    OnSaveCacheData: 'OnSaveCacheData',
    OnSaveAllCacheData: 'OnSaveAllCacheData',
    OnDeleteCacheData: 'OnDeleteCacheData',
    OnDeleteAllCacheData: 'OnDeleteAllCacheData',
    OnClearCacheData: 'OnClearCacheData',
    OnSearchGlobalCacheData: 'OnSearchGlobalCacheData',

    // 5. Preference
    OnFetchPreference: 'OnFetchPreference',
    OnSavePreference: 'OnSavePreference',
    OnDeletePreference: 'OnDeletePreference',

    // 6. Auth
    OnOAuthLogin: 'OnOAuthLogin',
    OnOAuthLogout: 'OnOAuthLogout',

    // 7. Common & Others
    OnFetchAppLogBuffer: 'OnFetchAppLogBuffer',
    OnPollAppLogBuffer: 'OnPollAppLogBuffer',
    OnClearAppLogBuffer: 'OnClearAppLogBuffer',
    OnFetchAppLogBufferSize: 'OnFetchAppLogBufferSize',
    OnSendLog: 'OnSendLog',

    // 8. Test DB Scenario Validation
    OnFetchTestRecord: 'OnFetchTestRecord',
    OnFetchAllTestRecords: 'OnFetchAllTestRecords',
    OnSaveTestRecord: 'OnSaveTestRecord',
    OnSaveAllTestRecords: 'OnSaveAllTestRecords',
    OnClearTestRecords: 'OnClearTestRecords',
} as const;

export type AppMessageType = (typeof AppMessageTypes)[keyof typeof AppMessageTypes];

// ======================================================================
// 이벤트 타입 분류 (Web 요청 없이 발생하는 단방향 이벤트)
// ======================================================================
export type EventMessageType = Extract<
    AppMessageType,
    | 'OnBackPressed'
    | 'OnReceiveNotification'
    | 'OnOpenNotification'
    | 'OnBackgroundStatusChanged'
    | 'OnCloseModal'
    | 'OnPurchaseSuccess'
    | 'OnPurchaseError'
    | 'OnUpdateDeviceInfo'
    | 'OnUploadProgress'
    | 'OnUploadComplete'
>;

// ======================================================================
// Message Data Map Definition
// ======================================================================
/** 메시지 타입과 해당 Data(Payload) 타입을 매핑하는 인터페이스입니다. Data가 없는 경우 never로 정의합니다. */
export interface AppMessageDataMap {
    // 1. Device & System
    OnUpdateDeviceInfo: OnUpdateDeviceInfoPayload;
    OnFetchSafeArea: OnFetchSafeAreaPayload;
    OnBackgroundStatusChanged: OnBackgroundStatusChangedPayload;
    OnSetCanGoBack: never;
    OnOpenModal: never;
    OnCloseModal: never;
    OnOpenSettings: never;
    OnOpenShareSheet: OnOpenShareSheetPayload;
    OnUploadProgress: OnUploadProgressPayload;
    OnUploadComplete: OnUploadCompletePayload;
    OnBackPressed: never;
    OnOpenDocument: OnOpenDocumentPayload;
    OnGetContacts: OnGetContactsPayload;
    OnOpenCamera: OnOpenCameraPayload;
    OnOpenPhotoLibrary: OnOpenPhotoLibraryPayload;
    OnRequestPermission: OnRequestPermissionPayload;
    OnOpenURL: never;
    OnSendSms: OnSendSmsPayload;
    OnFetchAppIcon: OnFetchAppIconPayload;
    OnFetchAppIconList: OnFetchAppIconListPayload;
    OnChangeAppIcon: OnChangeAppIconPayload;
    Pong: PongPayload;

    // 2. Notification
    OnFetchFcmToken: OnFetchFcmTokenPayload;
    OnReceiveNotification: OnNotificationPayload;
    OnOpenNotification: OnNotificationPayload;

    // 3. IAP
    OnFetchCurrentPurchases: OnFetchCurrentPurchasesPayload;
    OnFetchProducts: OnFetchProductsPayload;
    OnPurchase: never;
    OnPurchaseSuccess: OnPurchaseSuccessPayload;
    OnPurchaseError: OnPurchaseErrorPayload;
    OnFinishPurchaseTransaction: OnFinishPurchaseTransactionPayload;
    OnOpenSubscriptionManagement: never;

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
    OnSendLog: never;

    // 8. Test DB Scenario Validation
    OnFetchTestRecord: OnFetchTestRecordPayload;
    OnFetchAllTestRecords: OnFetchAllTestRecordsPayload;
    OnSaveTestRecord: OnSaveTestRecordPayload;
    OnSaveAllTestRecords: OnSaveAllTestRecordsPayload;
    OnClearTestRecords: OnClearTestRecordsPayload;
}

// ======================================================================
// App Message Core Interfaces & Types
// ======================================================================
export interface AppMessageError {
    code: string;
    message: string;
    details?: unknown;
}

export type AppDefaultMessage<T extends AppMessageType> = BaseMessage & {
    type: T;
    success: boolean;
    error?: AppMessageError;
} & (AppMessageDataMap[T] extends never ? { data?: never } : { data: AppMessageDataMap[T] });

export type AppMessageData<T extends AppMessageType> = AppDefaultMessage<T>;

export type AppMessage = {
    [K in AppMessageType]: AppDefaultMessage<K>;
}[AppMessageType];

import type {
    // 1. Device & System
    OpenModalPayload,
    OpenShareSheetPayload,
    OpenDocumentPayload,
    OpenCameraPayload,
    OpenPhotoLibraryPayload,
    RequestPermissionPayload,
    ScrollDataPayload,
    SetCanGoBackPayload,
    OpenURLPayload,

    // 3. IAP
    PurchasePayload,
    FinishPurchaseTransactionPayload,

    // 4. Cache
    FetchCacheDataPayload,
    FetchAllCacheDataPayload,
    SaveCacheDataPayload,
    SaveAllCacheDataPayload,
    DeleteCacheDataPayload,
    DeleteAllCacheDataPayload,
    ClearCacheDataPayload,
    SearchGlobalCacheDataPayload,

    // 5. Preference
    FetchPreferencePayload,
    SavePreferencePayload,
    DeletePreferencePayload,

    // 6. Auth
    OAuthLoginPayload,
    OAuthLogoutPayload,
    FetchAppLogBufferPayload,
    PollAppLogBufferPayload,
    SendLogPayload,
} from './model';

export const WebMessageTypes = {
    // 1. Device & System
    SetCanGoBack: 'SetCanGoBack',
    Scroll: 'Scroll',
    OpenModal: 'OpenModal',
    CloseModal: 'CloseModal',
    OpenSettings: 'OpenSettings',
    OpenShareSheet: 'OpenShareSheet',
    GetContacts: 'GetContacts',
    OpenDocument: 'OpenDocument',
    OpenCamera: 'OpenCamera',
    OpenPhotoLibrary: 'OpenPhotoLibrary',
    FetchDeviceInfo: 'FetchDeviceInfo',
    FetchSafeArea: 'FetchSafeArea',
    FetchBackgroundStatus: 'FetchBackgroundStatus',
    RequestPermission: 'RequestPermission',
    OpenURL: 'OpenURL',

    // 2. Notification
    FetchFcmToken: 'FetchFcmToken',

    // 3. IAP
    FetchProducts: 'FetchProducts',
    FetchCurrentPurchases: 'FetchCurrentPurchases',
    Purchase: 'Purchase',
    FinishPurchaseTransaction: 'FinishPurchaseTransaction',
    OpenSubscriptionManagement: 'OpenSubscriptionManagement',

    // 4. CacheData
    FetchCacheData: 'FetchCacheData',
    FetchAllCacheData: 'FetchAllCacheData',
    SaveCacheData: 'SaveCacheData',
    SaveAllCacheData: 'SaveAllCacheData',
    DeleteCacheData: 'DeleteCacheData',
    DeleteAllCacheData: 'DeleteAllCacheData',
    ClearCacheData: 'ClearCacheData',
    SearchGlobalCacheData: 'SearchGlobalCacheData',

    // 5. Preference
    FetchPreference: 'FetchPreference',
    SavePreference: 'SavePreference',
    DeletePreference: 'DeletePreference',

    // 6. Auth
    OAuthLogin: 'OAuthLogin',
    OAuthLogout: 'OAuthLogout',

    // 7. Common & Others
    ShowLoader: 'ShowLoader',
    HideLoader: 'HideLoader',
    SyncCredential: 'SyncCredential',
    PopWebView: 'PopWebView',
    FetchAppLogBuffer: 'FetchAppLogBuffer',
    PollAppLogBuffer: 'PollAppLogBuffer',
    ClearAppLogBuffer: 'ClearAppLogBuffer',
    FetchAppLogBufferSize: 'FetchAppLogBufferSize',
    SendLog: 'SendLog',
} as const;

export type WebMessageType = (typeof WebMessageTypes)[keyof typeof WebMessageTypes];

export interface WebMessageMap {
    // 1. Device & System
    SetCanGoBack: SetCanGoBack;
    Scroll: ScrollData;
    OpenModal: OpenModal;
    CloseModal: WebDefaultMessage<'CloseModal'>;
    OpenSettings: OpenSettings;
    OpenShareSheet: OpenShareSheet;
    GetContacts: GetContacts;
    OpenDocument: OpenDocument;
    OpenCamera: OpenCamera;
    OpenPhotoLibrary: OpenPhotoLibrary;
    FetchDeviceInfo: WebDefaultMessage<'FetchDeviceInfo'>;
    FetchSafeArea: WebDefaultMessage<'FetchSafeArea'>;
    FetchBackgroundStatus: WebDefaultMessage<'FetchBackgroundStatus'>;
    RequestPermission: RequestPermission;
    OpenURL: OpenURL;

    // 2. Notification
    FetchFcmToken: WebDefaultMessage<'FetchFcmToken'>;

    // 3. IAP
    FetchProducts: WebDefaultMessage<'FetchProducts'>;
    FetchCurrentPurchases: WebDefaultMessage<'FetchCurrentPurchases'>;
    Purchase: Purchase;
    FinishPurchaseTransaction: FinishPurchaseTransaction;
    OpenSubscriptionManagement: WebDefaultMessage<'OpenSubscriptionManagement'>;

    // 4. Cache
    FetchCacheData: FetchCacheData;
    FetchAllCacheData: FetchAllCacheData;
    SaveCacheData: SaveCacheData;
    SaveAllCacheData: SaveAllCacheData;
    DeleteCacheData: DeleteCacheData;
    DeleteAllCacheData: DeleteAllCacheData;
    ClearCacheData: ClearCacheData;
    SearchGlobalCacheData: SearchGlobalCacheData;

    // 5. Preference
    FetchPreference: FetchPreference;
    SavePreference: SavePreference;
    DeletePreference: DeletePreference;

    // 6. Auth
    OAuthLogin: OAuthLogin;
    OAuthLogout: OAuthLogout;

    // 7. Common & Others
    ShowLoader: WebDefaultMessage<'ShowLoader'>;
    HideLoader: WebDefaultMessage<'HideLoader'>;
    SyncCredential: WebDefaultMessage<'SyncCredential'>;
    PopWebView: WebDefaultMessage<'PopWebView'>;
    FetchAppLogBuffer: FetchAppLogBuffer;
    PollAppLogBuffer: PollAppLogBuffer;
    ClearAppLogBuffer: ClearAppLogBuffer;
    FetchAppLogBufferSize: FetchAppLogBufferSize;
    SendLog: SendLog;
}

export type WebMessageData<T extends WebMessageType> = WebMessageMap[T];
export type WebMessage = WebMessageData<WebMessageType>;

export interface WebDefaultMessage<T extends WebMessageType> {
    type: T;
    nonce?: string;
}

// ----------------------------------------------------------------------
// 1. Device & System Interfaces
// ----------------------------------------------------------------------
export interface SetCanGoBack extends WebDefaultMessage<'SetCanGoBack'> {
    data: SetCanGoBackPayload;
}

export interface ScrollData extends WebDefaultMessage<'Scroll'> {
    data: ScrollDataPayload;
}

export interface OpenModal extends WebDefaultMessage<'OpenModal'> {
    data: OpenModalPayload;
}

export interface OpenSettings extends WebDefaultMessage<'OpenSettings'> {} // payload 없음
export interface OpenShareSheet extends WebDefaultMessage<'OpenShareSheet'> {
    data: OpenShareSheetPayload;
}

export interface OpenDocument extends WebDefaultMessage<'OpenDocument'> {
    data: OpenDocumentPayload;
}

export interface GetContacts extends WebDefaultMessage<'GetContacts'> {} // payload 없음
export interface OpenCamera extends WebDefaultMessage<'OpenCamera'> {
    data: OpenCameraPayload;
}

export interface OpenPhotoLibrary extends WebDefaultMessage<'OpenPhotoLibrary'> {
    data: OpenPhotoLibraryPayload;
}

export interface RequestPermission extends WebDefaultMessage<'RequestPermission'> {
    data: RequestPermissionPayload;
}

/** 외부 URL 열기 (Native에서 Linking.openURL 처리) */
export interface OpenURL extends WebDefaultMessage<'OpenURL'> {
    data: OpenURLPayload;
}

// ----------------------------------------------------------------------
// 3. IAP Interfaces
// ----------------------------------------------------------------------
export interface Purchase extends WebDefaultMessage<'Purchase'> {
    data: PurchasePayload;
}

export interface FinishPurchaseTransaction extends WebDefaultMessage<'FinishPurchaseTransaction'> {
    data: FinishPurchaseTransactionPayload;
}

// ----------------------------------------------------------------------
// 4. Cache Interfaces
// ----------------------------------------------------------------------
export interface FetchCacheData extends WebDefaultMessage<'FetchCacheData'> {
    data: FetchCacheDataPayload;
}

export interface FetchAllCacheData extends WebDefaultMessage<'FetchAllCacheData'> {
    data: FetchAllCacheDataPayload;
}

export interface SaveCacheData extends WebDefaultMessage<'SaveCacheData'> {
    data: SaveCacheDataPayload;
}

export interface SaveAllCacheData extends WebDefaultMessage<'SaveAllCacheData'> {
    data: SaveAllCacheDataPayload;
}

export interface DeleteCacheData extends WebDefaultMessage<'DeleteCacheData'> {
    data: DeleteCacheDataPayload;
}

export interface DeleteAllCacheData extends WebDefaultMessage<'DeleteAllCacheData'> {
    data: DeleteAllCacheDataPayload;
}

export interface ClearCacheData extends WebDefaultMessage<'ClearCacheData'> {
    data: ClearCacheDataPayload;
}

export interface SearchGlobalCacheData extends WebDefaultMessage<'SearchGlobalCacheData'> {
    data: SearchGlobalCacheDataPayload;
}

// ----------------------------------------------------------------------
// 5. Preference Interfaces
// ----------------------------------------------------------------------
export interface FetchPreference extends WebDefaultMessage<'FetchPreference'> {
    data: FetchPreferencePayload;
}

export interface SavePreference extends WebDefaultMessage<'SavePreference'> {
    data: SavePreferencePayload;
}

export interface DeletePreference extends WebDefaultMessage<'DeletePreference'> {
    data: DeletePreferencePayload;
}

// ----------------------------------------------------------------------
// 6. Auth Interfaces
// ----------------------------------------------------------------------
export interface OAuthLogin extends WebDefaultMessage<'OAuthLogin'> {
    data: OAuthLoginPayload;
}

export interface OAuthLogout extends WebDefaultMessage<'OAuthLogout'> {
    data: OAuthLogoutPayload;
}

// ----------------------------------------------------------------------
// 7. Common & Others Interfaces
// ----------------------------------------------------------------------
export interface FetchAppLogBuffer extends WebDefaultMessage<'FetchAppLogBuffer'> {
    data: FetchAppLogBufferPayload;
}

export interface PollAppLogBuffer extends WebDefaultMessage<'PollAppLogBuffer'> {
    data: PollAppLogBufferPayload;
}

export interface ClearAppLogBuffer extends WebDefaultMessage<'ClearAppLogBuffer'> {}

export interface FetchAppLogBufferSize extends WebDefaultMessage<'FetchAppLogBufferSize'> {}

export interface SendLog extends WebDefaultMessage<'SendLog'> {
    data: SendLogPayload;
}

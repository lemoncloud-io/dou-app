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
    FetchCachePayload,
    FetchAllCachePayload,
    SaveCachePayload,
    SaveAllCachePayload,
    DeleteCachePayload,
    DeleteAllCachePayload,
    ClearCachePayload,
    SearchGlobalCachePayload,

    // 5. Preference
    FetchPreferencePayload,
    SavePreferencePayload,
    DeletePreferencePayload,

    // 6. Auth
    OAuthLoginPayload,
    OAuthLogoutPayload,
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

    // 4. Cache
    FetchCache: 'FetchCache',
    FetchAllCache: 'FetchAllCache',
    SaveCache: 'SaveCache',
    SaveAllCache: 'SaveAllCache',
    DeleteCache: 'DeleteCache',
    DeleteAllCache: 'DeleteAllCache',
    ClearCache: 'ClearCache',
    SearchGlobalCache: 'SearchGlobalCache',

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
    FetchCache: FetchCache;
    FetchAllCache: FetchAllCache;
    SaveCache: SaveCache;
    SaveAllCache: SaveAllCache;
    DeleteCache: DeleteCache;
    DeleteAllCache: DeleteAllCache;
    ClearCache: ClearCache;
    SearchGlobalCache: SearchGlobalCache;

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
export interface FetchCache extends WebDefaultMessage<'FetchCache'> {
    data: FetchCachePayload;
}
export interface FetchAllCache extends WebDefaultMessage<'FetchAllCache'> {
    data: FetchAllCachePayload;
}
export interface SaveCache extends WebDefaultMessage<'SaveCache'> {
    data: SaveCachePayload;
}
export interface SaveAllCache extends WebDefaultMessage<'SaveAllCache'> {
    data: SaveAllCachePayload;
}
export interface DeleteCache extends WebDefaultMessage<'DeleteCache'> {
    data: DeleteCachePayload;
}
export interface DeleteAllCache extends WebDefaultMessage<'DeleteAllCache'> {
    data: DeleteAllCachePayload;
}
export interface ClearCache extends WebDefaultMessage<'ClearCache'> {
    data: ClearCachePayload;
}
export interface SearchGlobalCache extends WebDefaultMessage<'SearchGlobalCache'> {
    data: SearchGlobalCachePayload;
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

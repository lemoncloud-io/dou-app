import type {
    ChangeAppIconPayload,
    ClearAppLogBufferPayload,
    ClearCacheDataPayload,
    CloseModalPayload,
    DeleteAllCacheDataPayload,
    DeleteCacheDataPayload,
    DeletePreferencePayload,
    FetchAllCacheDataPayload,
    FetchAppIconListPayload,
    FetchAppIconPayload,
    FetchAppLogBufferPayload,
    FetchAppLogBufferSizePayload,
    FetchBackgroundStatusPayload,
    FetchCacheDataPayload,
    FetchCurrentPurchasesPayload,
    FetchDeviceInfoPayload,
    FetchFcmTokenPayload,
    FetchPreferencePayload,
    FetchProductsPayload,
    FetchSafeAreaPayload,
    FinishPurchaseTransactionPayload,
    GetContactsPayload,
    HideLoaderPayload,
    OAuthLoginPayload,
    OAuthLogoutPayload,
    OnBackgroundStatusChangedPayload,
    OnBackPressedPayload,
    OnChangeAppIconPayload,
    OnClearAppLogBufferPayload,
    OnClearCacheDataPayload,
    OnCloseModalPayload,
    OnDeleteAllCacheDataPayload,
    OnDeleteCacheDataPayload,
    OnDeletePreferencePayload,
    OnFetchAllCacheDataPayload,
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
    OnFinishPurchaseTransactionPayload,
    OnGetContactsPayload,
    OnHideLoaderPayload,
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
    OnPopWebViewPayload,
    OnPurchaseSuccessPayload,
    OnReceiveAppLogPayload,
    OnRequestPermissionPayload,
    OnSaveAllCacheDataPayload,
    OnSaveCacheDataPayload,
    OnSavePreferencePayload,
    OnScrollPayload,
    OnSearchGlobalCacheDataPayload,
    OnSendLogPayload,
    OnSetCanGoBackPayload,
    OnShowLoaderPayload,
    OnSuccessSyncCredentialPayload,
    OnUpdateDeviceInfoPayload,
    OpenCameraPayload,
    OpenDocumentPayload,
    OpenModalPayload,
    OpenPhotoLibraryPayload,
    OpenSettingsPayload,
    OpenShareSheetPayload,
    OpenSubscriptionManagementPayload,
    OpenURLPayload,
    PollAppLogBufferPayload,
    PopWebViewPayload,
    PurchasePayload,
    RequestPermissionPayload,
    SaveAllCacheDataPayload,
    SaveCacheDataPayload,
    SavePreferencePayload,
    ScrollDataPayload,
    SearchGlobalCacheDataPayload,
    SendLogPayload,
    SetCanGoBackPayload,
    ShowLoaderPayload,
    SyncCredentialPayload,
} from './payload';

export interface BaseMessage<TType extends string = string> {
    type: TType;
    refId: string;
    version: string;
}

export interface BridgeError {
    code: string;
    message: string;
    details?: unknown;
}

export type PayloadMap = Record<string, any>;

// Request (Web -> App) 타입 및 페이로드 매핑
export interface RequestPayloadMap extends PayloadMap {
    SetCanGoBack: SetCanGoBackPayload;
    Scroll: ScrollDataPayload;
    OpenModal: OpenModalPayload;
    CloseModal: CloseModalPayload;
    OpenSettings: OpenSettingsPayload;
    OpenShareSheet: OpenShareSheetPayload;
    GetContacts: GetContactsPayload;
    OpenDocument: OpenDocumentPayload;
    OpenCamera: OpenCameraPayload;
    OpenPhotoLibrary: OpenPhotoLibraryPayload;
    FetchDeviceInfo: FetchDeviceInfoPayload;
    FetchSafeArea: FetchSafeAreaPayload;
    FetchBackgroundStatus: FetchBackgroundStatusPayload;
    RequestPermission: RequestPermissionPayload;
    OpenURL: OpenURLPayload;
    FetchAppIcon: FetchAppIconPayload;
    FetchAppIconList: FetchAppIconListPayload;
    ChangeAppIcon: ChangeAppIconPayload;
    FetchFcmToken: FetchFcmTokenPayload;
    FetchProducts: FetchProductsPayload;
    FetchCurrentPurchases: FetchCurrentPurchasesPayload;
    Purchase: PurchasePayload;
    FinishPurchaseTransaction: FinishPurchaseTransactionPayload;
    OpenSubscriptionManagement: OpenSubscriptionManagementPayload;
    FetchCacheData: FetchCacheDataPayload;
    FetchAllCacheData: FetchAllCacheDataPayload;
    SaveCacheData: SaveCacheDataPayload;
    SaveAllCacheData: SaveAllCacheDataPayload;
    DeleteCacheData: DeleteCacheDataPayload;
    DeleteAllCacheData: DeleteAllCacheDataPayload;
    ClearCacheData: ClearCacheDataPayload;
    SearchGlobalCacheData: SearchGlobalCacheDataPayload;
    FetchPreference: FetchPreferencePayload;
    SavePreference: SavePreferencePayload;
    DeletePreference: DeletePreferencePayload;
    OAuthLogin: OAuthLoginPayload;
    OAuthLogout: OAuthLogoutPayload;
    ShowLoader: ShowLoaderPayload;
    HideLoader: HideLoaderPayload;
    SyncCredential: SyncCredentialPayload;
    PopWebView: PopWebViewPayload;
    FetchAppLogBuffer: FetchAppLogBufferPayload;
    PollAppLogBuffer: PollAppLogBufferPayload;
    ClearAppLogBuffer: ClearAppLogBufferPayload;
    FetchAppLogBufferSize: FetchAppLogBufferSizePayload;
    SendLog: SendLogPayload;
}

export type RequestType = Extract<keyof RequestPayloadMap, string>;

// Response (App -> Web) 타입 및 페이로드 매핑
export interface ResponsePayloadMap extends PayloadMap {
    OnSetCanGoBack: OnSetCanGoBackPayload;
    OnScroll: OnScrollPayload;
    OnOpenModal: OnOpenModalPayload;
    OnCloseModal: OnCloseModalPayload;
    OnOpenSettings: OnOpenSettingsPayload;
    OnOpenShareSheet: OnOpenShareSheetPayload;
    OnGetContacts: OnGetContactsPayload;
    OnOpenDocument: OnOpenDocumentPayload;
    OnOpenCamera: OnOpenCameraPayload;
    OnOpenPhotoLibrary: OnOpenPhotoLibraryPayload;
    OnUpdateDeviceInfo: OnUpdateDeviceInfoPayload;
    OnFetchSafeArea: OnFetchSafeAreaPayload;
    OnBackgroundStatusChanged: OnBackgroundStatusChangedPayload;
    OnRequestPermission: OnRequestPermissionPayload;
    OnOpenURL: OnOpenURLPayload;
    OnFetchAppIcon: OnFetchAppIconPayload;
    OnFetchAppIconList: OnFetchAppIconListPayload;
    OnChangeAppIcon: OnChangeAppIconPayload;
    OnFetchFcmToken: OnFetchFcmTokenPayload;
    OnFetchProducts: OnFetchProductsPayload;
    OnFetchCurrentPurchases: OnFetchCurrentPurchasesPayload;
    OnPurchaseSuccess: OnPurchaseSuccessPayload;
    OnFinishPurchaseTransaction: OnFinishPurchaseTransactionPayload;
    OnOpenSubscriptionManagement: OnOpenSubscriptionManagementPayload;
    OnFetchCacheData: OnFetchCacheDataPayload;
    OnFetchAllCacheData: OnFetchAllCacheDataPayload;
    OnSaveCacheData: OnSaveCacheDataPayload;
    OnSaveAllCacheData: OnSaveAllCacheDataPayload;
    OnDeleteCacheData: OnDeleteCacheDataPayload;
    OnDeleteAllCacheData: OnDeleteAllCacheDataPayload;
    OnClearCacheData: OnClearCacheDataPayload;
    OnSearchGlobalCacheData: OnSearchGlobalCacheDataPayload;
    OnFetchPreference: OnFetchPreferencePayload;
    OnSavePreference: OnSavePreferencePayload;
    OnDeletePreference: OnDeletePreferencePayload;
    OnOAuthLogin: OnOAuthLoginPayload;
    OnOAuthLogout: OnOAuthLogoutPayload;
    OnShowLoader: OnShowLoaderPayload;
    OnHideLoader: OnHideLoaderPayload;
    OnSuccessSyncCredential: OnSuccessSyncCredentialPayload;
    OnPopWebView: OnPopWebViewPayload;
    OnFetchAppLogBuffer: OnFetchAppLogBufferPayload;
    OnPollAppLogBuffer: OnPollAppLogBufferPayload;
    OnClearAppLogBuffer: OnClearAppLogBufferPayload;
    OnFetchAppLogBufferSize: OnFetchAppLogBufferSizePayload;
    OnSendLog: OnSendLogPayload;
}

export type ResponseType = Extract<keyof ResponsePayloadMap, string>;

// Event (App -> Web) 타입 및 페이로드 매핑
export interface EventPayloadMap extends PayloadMap {
    OnBackPressed: OnBackPressedPayload;
    OnReceiveNotification: OnNotificationPayload;
    OnOpenNotification: OnNotificationPayload;
    OnReceiveAppLog: OnReceiveAppLogPayload;
}

export type EventType = Extract<keyof EventPayloadMap, string>;

// Request - Response 매핑 관계 구조체
export interface BridgePairMap extends Record<RequestType, ResponseType> {
    SetCanGoBack: 'OnSetCanGoBack';
    Scroll: 'OnScroll';
    OpenModal: 'OnOpenModal';
    CloseModal: 'OnCloseModal';
    OpenSettings: 'OnOpenSettings';
    OpenShareSheet: 'OnOpenShareSheet';
    GetContacts: 'OnGetContacts';
    OpenDocument: 'OnOpenDocument';
    OpenCamera: 'OnOpenCamera';
    OpenPhotoLibrary: 'OnOpenPhotoLibrary';
    FetchDeviceInfo: 'OnUpdateDeviceInfo';
    FetchSafeArea: 'OnFetchSafeArea';
    FetchBackgroundStatus: 'OnBackgroundStatusChanged';
    RequestPermission: 'OnRequestPermission';
    OpenURL: 'OnOpenURL';
    FetchAppIcon: 'OnFetchAppIcon';
    FetchAppIconList: 'OnFetchAppIconList';
    ChangeAppIcon: 'OnChangeAppIcon';
    FetchFcmToken: 'OnFetchFcmToken';
    FetchProducts: 'OnFetchProducts';
    FetchCurrentPurchases: 'OnFetchCurrentPurchases';
    Purchase: 'OnPurchaseSuccess';
    FinishPurchaseTransaction: 'OnFinishPurchaseTransaction';
    OpenSubscriptionManagement: 'OnOpenSubscriptionManagement';
    FetchCacheData: 'OnFetchCacheData';
    FetchAllCacheData: 'OnFetchAllCacheData';
    SaveCacheData: 'OnSaveCacheData';
    SaveAllCacheData: 'OnSaveAllCacheData';
    DeleteCacheData: 'OnDeleteCacheData';
    DeleteAllCacheData: 'OnDeleteAllCacheData';
    ClearCacheData: 'OnClearCacheData';
    SearchGlobalCacheData: 'OnSearchGlobalCacheData';
    FetchPreference: 'OnFetchPreference';
    SavePreference: 'OnSavePreference';
    DeletePreference: 'OnDeletePreference';
    OAuthLogin: 'OnOAuthLogin';
    OAuthLogout: 'OnOAuthLogout';
    ShowLoader: 'OnShowLoader';
    HideLoader: 'OnHideLoader';
    SyncCredential: 'OnSuccessSyncCredential';
    PopWebView: 'OnPopWebView';
    FetchAppLogBuffer: 'OnFetchAppLogBuffer';
    PollAppLogBuffer: 'OnPollAppLogBuffer';
    ClearAppLogBuffer: 'OnClearAppLogBuffer';
    FetchAppLogBufferSize: 'OnFetchAppLogBufferSize';
    SendLog: 'OnSendLog';
}

/**
 * [Request] Web -> App
 */
export interface TypedRequestMessage<K extends RequestType> extends BaseMessage<K> {
    payload: RequestPayloadMap[K];
}

/**
 * [Event] App -> Web
 */
export interface TypedEventMessage<K extends EventType> extends BaseMessage<K> {
    payload: EventPayloadMap[K];
}

/**
 * [Response] App -> Web
 */
export type TypedResponseMessage<K extends ResponseType> = BaseMessage<K> &
    ({ success: true; data: ResponsePayloadMap[K] } | { success: false; error: BridgeError });

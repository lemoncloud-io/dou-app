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
    PingPayload,
    PollAppLogBufferPayload,
    PongPayload,
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

/**
 * 브릿지 통신에서 사용되는 모든 메시지의 최상위 기본 규격(Base)입니다.
 * @template TType - 메시지의 고유 식별자 타입 (기본값: string)
 */
export interface BaseMessage<TType extends string = string> {
    /**
     * 메시지의 종류를 나타내는 고유 식별자입니다.
     * Request, Response, Event에 따라 특정 리터럴 타입으로 좁혀집니다.
     */
    type: TType;

    /**
     * 메시지의 고유 식별 ID입니다.
     * 양방향 통신(Request-Response) 시 요청과 응답을 1:1로 정확히 매칭하기 위해 필수적으로 사용됩니다.
     */
    refId: string;

    /**
     * 통신 프로토콜 또는 메시지 규약의 버전 정보입니다.
     * 앱과 웹 간의 하위 호환성 관리를 위해 사용됩니다.
     */
    version: string;
}

/**
 * 브릿지 통신 실패 시(success: false) 반환되는 표준 에러 객체 규격입니다.
 */
export interface BridgeError {
    /**
     * 에러 유형을 프로그램 레벨에서 식별하기 위한 고유 에러 코드입니다.
     * (예: 'TIMEOUT', 'NOT_FOUND', 'UNAUTHORIZED')
     */
    code: string;

    /**
     * 개발자 또는 디버깅 환경에서 읽을 수 있는 명시적인 에러 메시지입니다.
     */
    message: string;

    /**
     * 에러 발생 상황에 대한 추가적인 상세 컨텍스트나 메타데이터입니다. (optional)
     */
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
    Ping: PingPayload;
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
    Pong: PongPayload;
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
    Ping: 'Pong';
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

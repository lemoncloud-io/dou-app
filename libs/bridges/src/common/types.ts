import type { AppMessageMap, AppMessageType, WebMessageMap, WebMessageType } from '@chatic/app-messages';

export type RequestType = WebMessageType;
export type ResponseType = AppMessageType;

/**
 * 브릿지 통신에서 사용되는 모든 메시지의 최상위 기본 규격(Base)입니다.
 * 기존의 WebDefaultMessage / AppDefaultMessage 의 nonce 를 유지하면서 확장합니다.
 */
export interface BaseMessage<TType extends string = string> {
    type: TType;
    refId: string;
    version: string;
    nonce?: string; // 하위 호환성 및 Web-App 간 에코(Echo)용으로 유지
}

/**
 * 브릿지 통신 실패 시 반환되는 표준 에러 객체 규격입니다.
 */
export interface BridgeError {
    code: string;
    message: string;
    details?: unknown;
}

// AppBridgeHost 및 제네릭 환경에서 범용적으로 쓰이는 PayloadMap 호환성 유지
export type PayloadMap = Record<string, any>;

// ======================================================================
// 이벤트 타입 분류 (AppMessage 중 Web의 요청 없이 발생하는 단방향 이벤트)
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
>;
export type EventType = EventMessageType;

// ======================================================================
// Pair Relation Mapping (Request <-> Response 1:1 매칭)
// 응답이 없는 단방향 요청의 경우 'void'로 매핑합니다.
// ======================================================================
export interface BridgePairMap extends Record<WebMessageType, AppMessageType | 'void'> {
    // 1. Device & System
    SetCanGoBack: 'void';
    Scroll: 'void';
    OpenModal: 'void';
    CloseModal: 'OnCloseModal';
    OpenSettings: 'void';
    OpenShareSheet: 'OnOpenShareSheet';
    GetContacts: 'OnGetContacts';
    OpenDocument: 'OnOpenDocument';
    OpenCamera: 'OnOpenCamera';
    OpenPhotoLibrary: 'OnOpenPhotoLibrary';
    FetchDeviceInfo: 'OnUpdateDeviceInfo';
    FetchSafeArea: 'OnFetchSafeArea';
    FetchBackgroundStatus: 'OnBackgroundStatusChanged';
    RequestPermission: 'OnRequestPermission';
    OpenURL: 'void';
    FetchAppIcon: 'OnFetchAppIcon';
    FetchAppIconList: 'OnFetchAppIconList';
    ChangeAppIcon: 'OnChangeAppIcon';

    // 2. Notification
    FetchFcmToken: 'OnFetchFcmToken';

    // 3. IAP
    FetchProducts: 'OnFetchProducts';
    FetchCurrentPurchases: 'OnFetchCurrentPurchases';
    Purchase: 'void';
    FinishPurchaseTransaction: 'OnFinishPurchaseTransaction';
    OpenSubscriptionManagement: 'void';

    // 4. Cache
    FetchCacheData: 'OnFetchCacheData';
    FetchAllCacheData: 'OnFetchAllCacheData';
    SaveCacheData: 'OnSaveCacheData';
    SaveAllCacheData: 'OnSaveAllCacheData';
    DeleteCacheData: 'OnDeleteCacheData';
    DeleteAllCacheData: 'OnDeleteAllCacheData';
    ClearCacheData: 'OnClearCacheData';
    SearchGlobalCacheData: 'OnSearchGlobalCacheData';

    // 5. Preference
    FetchPreference: 'OnFetchPreference';
    SavePreference: 'OnSavePreference';
    DeletePreference: 'OnDeletePreference';

    // 6. Auth
    OAuthLogin: 'OnOAuthLogin';
    OAuthLogout: 'OnOAuthLogout';

    // 7. Common & Others
    ShowLoader: 'void';
    HideLoader: 'void';
    SyncCredential: 'OnSuccessSyncCredential';
    PopWebView: 'void';
    FetchAppLogBuffer: 'OnFetchAppLogBuffer';
    PollAppLogBuffer: 'OnPollAppLogBuffer';
    ClearAppLogBuffer: 'OnClearAppLogBuffer';
    FetchAppLogBufferSize: 'OnFetchAppLogBufferSize';
    SendLog: 'void';
    Ping: 'Pong';
}

// ======================================================================
// Final Message Structures (Type Guards)
// ======================================================================

/**
 * [Request] Web -> App
 * 기존 web-message.ts에 정의된 규격(nonce, data 등)을 BaseMessage와 안전하게 결합(&)
 */
export type TypedRequestMessage<K extends WebMessageType> = BaseMessage<K> & WebMessageMap[K];

/**
 * [Event] App -> Web
 * 기존 app-message.ts에 정의된 이벤트 규격을 BaseMessage와 안전하게 결합(&)
 */
export type TypedEventMessage<K extends EventMessageType> = BaseMessage<K> & AppMessageMap[K];

/**
 * [Response] App -> Web
 * AppMessageMap의 구조체 내부에 있는 'data' 페이로드의 타입을 동적으로 추론하여 응답 규격에 주입
 */
type ExtractResponseData<K extends WebMessageType> = BridgePairMap[K] extends AppMessageType
    ? AppMessageMap[BridgePairMap[K]] extends { data: infer D }
        ? D
        : undefined
    : undefined;

export type TypedResponseMessage<K extends WebMessageType> = BaseMessage<
    BridgePairMap[K] extends string ? BridgePairMap[K] : 'void'
> &
    ({ success: true; data: ExtractResponseData<K> } | { success: false; error: BridgeError });

// ======================================================================
// 하위 모듈들(Adapter, Client, Host)과의 완벽한 호환성을 위한 포괄 타입 선언
// ======================================================================
export type RequestMessage = TypedRequestMessage<WebMessageType>;
export type EventMessage = TypedEventMessage<EventMessageType>;
export type ResponseMessage = TypedResponseMessage<WebMessageType>;

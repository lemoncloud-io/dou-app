import type { AppMessageError, AppMessageType, AppResponseMessage, AppSuccessMessage } from './app-message';
import type { BaseMessage } from './types';
import type { WebMessageData, WebMessagePayloadMap, WebMessageType } from './web-message';

export type WebMessageRequest<K extends WebMessageType> = WebMessageData<K>;

/** request(type, params) overload에서 명시적으로 data를 감싼 요청 본문입니다. */
export type WebMessageRequestEnvelope<K extends WebMessageType> = BaseMessage & {
    data: WebMessagePayloadMap[K];
};

/**
 * @deprecated 현재 Web -> 과거 App 호환을 위해서만 유지합니다.
 * 새 호출부는 `request({ type, data })` 또는 `post({ type, data })` message object 형태를 사용하세요.
 */
export type LegacyWebMessageRequestPayloadParams<K extends WebMessageType> = WebMessagePayloadMap[K] & BaseMessage;

/**
 * 기존 Web caller 호환을 위한 request/post 두 번째 인자 타입입니다.
 * `request('OAuthLogin', { provider })`처럼 payload를 직접 넘겨도 WebBridgeClient가 `{ data: payload }`로 정규화합니다.
 */
export type WebMessageRequestParams<K extends WebMessageType> =
    | WebMessageRequestEnvelope<K>
    | LegacyWebMessageRequestPayloadParams<K>;

/**
 * Web -> App 요청이 어떤 App -> Web 응답으로 resolve되어야 하는지 정의하는 단일 계약입니다.
 * 런타임 검증(WebBridgeClient)과 정적 타입 추론(IWebBridgeClient/useWebMessageRouter)이 같은 맵을 공유합니다.
 */
export const WEB_MESSAGE_RESPONSE_TYPE = {
    SetCanGoBack: 'OnSetCanGoBack',
    OpenModal: 'OnOpenModal',
    CloseModal: 'OnCloseModal',
    OpenSettings: 'OnOpenSettings',
    RequestFileUpload: 'OnRequestFileUpload',
    PauseFileUpload: 'OnPauseFileUpload',
    ResumeFileUpload: 'OnResumeFileUpload',
    CancelFileUpload: 'OnCancelFileUpload',
    ListRecoverableUploads: 'OnListRecoverableUploads',
    RecoverUpload: 'OnRecoverUpload',
    RetryUpload: 'OnRetryUpload',
    CreateDummyFile: 'OnCreateDummyFile',
    OpenShareSheet: 'OnOpenShareSheet',
    GetContacts: 'OnGetContacts',
    OpenDocument: 'OnOpenDocument',
    OpenCamera: 'OnOpenCamera',
    OpenPhotoLibrary: 'OnOpenPhotoLibrary',
    FetchSafeArea: 'OnFetchSafeArea',
    FetchBackgroundStatus: 'OnBackgroundStatusChanged',
    RequestPermission: 'OnRequestPermission',
    OpenURL: 'OnOpenURL',
    SendSms: 'OnSendSms',
    FetchAppIcon: 'OnFetchAppIcon',
    FetchAppIconList: 'OnFetchAppIconList',
    ChangeAppIcon: 'OnChangeAppIcon',
    CopyToClipboard: 'OnCopyToClipboard',
    FetchFcmToken: 'OnFetchFcmToken',
    FetchBadgeCount: 'OnFetchBadgeCount',
    SetBadgeCount: 'OnSetBadgeCount',
    FetchProducts: 'OnFetchProducts',
    FetchCurrentPurchases: 'OnFetchCurrentPurchases',
    Purchase: 'OnPurchase',
    FinishPurchaseTransaction: 'OnFinishPurchaseTransaction',
    OpenSubscriptionManagement: 'OnOpenSubscriptionManagement',
    FetchCacheData: 'OnFetchCacheData',
    FetchAllCacheData: 'OnFetchAllCacheData',
    SaveCacheData: 'OnSaveCacheData',
    SaveAllCacheData: 'OnSaveAllCacheData',
    DeleteCacheData: 'OnDeleteCacheData',
    DeleteAllCacheData: 'OnDeleteAllCacheData',
    ClearCacheData: 'OnClearCacheData',
    SearchGlobalCacheData: 'OnSearchGlobalCacheData',
    FetchPreference: 'OnFetchPreference',
    SavePreference: 'OnSavePreference',
    DeletePreference: 'OnDeletePreference',
    OAuthLogin: 'OnOAuthLogin',
    OAuthLogout: 'OnOAuthLogout',
    WebAppReady: 'OnWebAppReady',
    ShowLoader: 'OnShowLoader',
    HideLoader: 'OnHideLoader',
    SyncCredential: 'OnSyncCredential',
    PopWebView: 'OnPopWebView',
    FetchAppLogBuffer: 'OnFetchAppLogBuffer',
    PollAppLogBuffer: 'OnPollAppLogBuffer',
    ClearAppLogBuffer: 'OnClearAppLogBuffer',
    FetchAppLogBufferSize: 'OnFetchAppLogBufferSize',
    SendLog: 'OnSendLog',
    Ping: 'Pong',
    FetchTestRecord: 'OnFetchTestRecord',
    FetchAllTestRecords: 'OnFetchAllTestRecords',
    SaveTestRecord: 'OnSaveTestRecord',
    SaveAllTestRecords: 'OnSaveAllTestRecords',
    ClearTestRecords: 'OnClearTestRecords',
} as const satisfies Record<WebMessageType, AppMessageType>;

export type WebMessageResponseTypeMap = typeof WEB_MESSAGE_RESPONSE_TYPE;

export type WebMessageResponseType<K extends WebMessageType> = WebMessageResponseTypeMap[K];

/** Web client request가 성공했을 때 caller가 받는 응답 타입입니다. */
export type WebMessageSuccessResponse<K extends WebMessageType> = AppSuccessMessage<WebMessageResponseType<K>>;

/** Native handler 함수 자체에서 payload까지 엄격하게 반환 타입을 고정하고 싶을 때 사용합니다. */
export type WebMessageAppResponse<K extends WebMessageType> = AppResponseMessage<WebMessageResponseType<K>>;

/** useCallback 등 개별 handler 선언부에서 요청/응답 타입 추론을 보존하기 위한 strict handler 타입입니다. */
export type WebMessageAppHandler<K extends WebMessageType> = (
    message: WebMessageRequest<K>
) => Promise<WebMessageAppResponse<K>>;

/**
 * Native handler가 bridge host로 반환하는 응답 타입입니다.
 * Handler 단계에서는 refId/version이 아직 주입되지 않고 일부 도메인 payload가 union 상관관계를 잃을 수 있어,
 * 응답 message type만 엄격히 고정하고 data는 host/client 경계에서 검증합니다.
 */
export type WebMessageHandlerResponse<K extends WebMessageType> = BaseMessage & {
    type: WebMessageResponseType<K>;
    success: boolean;
    data?: unknown;
    error?: AppMessageError;
};

/** 특정 WebMessage 요청을 처리하는 native handler의 표준 시그니처입니다. */
export type WebMessageHandler<K extends WebMessageType> = (
    message: WebMessageRequest<K>
) => WebMessageHandlerResponse<K> | Promise<WebMessageHandlerResponse<K>>;

/** useWebMessageRouter 같은 중앙 라우터에서 요청별 handler 응답 type을 검증하기 위한 맵입니다. */
export type WebMessageHandlerMap = {
    [K in WebMessageType]?: WebMessageHandler<K>;
};

/** Bridge 경계에서 발생하는 에러 코드입니다. 도메인 handler 에러 코드를 보존하기 위해 string 확장을 허용합니다. */
export type BridgeErrorCode =
    | 'NOT_FOUND'
    | 'TIMEOUT'
    | 'INTERNAL_ERROR'
    | 'NATIVE_NOT_SUPPORTED'
    | 'RESPONSE_TYPE_MISMATCH'
    | 'MALFORMED_RESPONSE'
    | string;

export type BridgeError = AppMessageError & {
    code: BridgeErrorCode;
    /** 사람이 읽는 message와 별개로, 로그/관측에서 원인을 분류하기 위한 내부 설명입니다. */
    reason?: string;
    /** 여러 로그 시스템에서 같은 bridge 실패를 이어보기 위한 식별자입니다. */
    traceId?: string;
    requestType?: WebMessageType | string;
    expectedResponseType?: AppMessageType | string;
    actualResponseType?: string;
    protocolVersion?: string;
    appVersion?: string;
    webVersion?: string;
    platform?: 'ios' | 'android' | 'web' | string;
    recoverable?: boolean;
};

/** AppMessage 유니온에 속하지 않는 bridge-level 실패 응답입니다. */
export type BridgeErrorResponse = BaseMessage & {
    type: 'ERROR';
    success: false;
    error: BridgeError;
};

/**
 * 구버전 모바일 앱이 WebAppReady 요청에 동일 type으로 응답하던 wire format입니다.
 * 신규 client는 이를 OnWebAppReady로 normalize해서 웹/모바일 배포 싱크 불일치를 흡수합니다.
 */
export type LegacyWebAppReadyResponse = BaseMessage & {
    type: 'WebAppReady';
    success: true;
    data?: Record<string, never>;
};

/** Bridge adapter를 통해 들어올 수 있는 응답 전체입니다. */
export type BridgeResponseMessage<K extends WebMessageType = WebMessageType> =
    | WebMessageHandlerResponse<K>
    | BridgeErrorResponse
    | LegacyWebAppReadyResponse;

import type { AppMessageError, AppMessageType, AppResponseMessage, AppSuccessMessage } from './app-message';
import type { BaseMessage } from './types';
import type { WebMessageData, WebMessageType } from './web-message';

export type WebMessageRequest<K extends WebMessageType> = WebMessageData<K>;

/**
 * The single contract defining which App -> Web response a Web -> App request should
 * resolve to.
 * Runtime validation (WebBridgeClient) and static type inference (IWebBridgeClient /
 * useWebMessageRouter) share this same map.
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
    DismissResumeOverlay: 'OnDismissResumeOverlay',
    FetchFcmToken: 'OnFetchFcmToken',
    FetchBadgeCount: 'OnFetchBadgeCount',
    FetchBadgeBase: 'OnFetchBadgeBase',
    FetchPushMarks: 'OnFetchPushMarks',
    SetBadgeCount: 'OnSetBadgeCount',
    ShowNotification: 'OnShowNotification',
    FetchUrlMetadata: 'OnFetchUrlMetadata',
    FetchProducts: 'OnFetchProducts',
    FetchCurrentPurchases: 'OnFetchCurrentPurchases',
    Purchase: 'OnPurchase',
    FinishPurchaseTransaction: 'OnFinishPurchaseTransaction',
    OpenSubscriptionManagement: 'OnOpenSubscriptionManagement',
    FetchCacheData: 'OnFetchCacheData',
    FetchManyCacheData: 'OnFetchManyCacheData',
    FetchLastChatsData: 'OnFetchLastChatsData',
    FetchAllCacheData: 'OnFetchAllCacheData',
    SaveCacheData: 'OnSaveCacheData',
    SaveAllCacheData: 'OnSaveAllCacheData',
    DeleteCacheData: 'OnDeleteCacheData',
    DeleteAllCacheData: 'OnDeleteAllCacheData',
    ClearCacheData: 'OnClearCacheData',
    ClearCacheDataByChannel: 'OnClearCacheDataByChannel',
    SearchGlobalCacheData: 'OnSearchGlobalCacheData',
    FetchPreference: 'OnFetchPreference',
    SavePreference: 'OnSavePreference',
    DeletePreference: 'OnDeletePreference',
    OAuthLogin: 'OnOAuthLogin',
    OAuthLogout: 'OnOAuthLogout',
    SaveConfigValue: 'OnSaveConfigValue',
    DeleteFcmToken: 'OnDeleteFcmToken',
    FetchBootRecords: 'OnFetchBootRecords',
    ClearBootRecords: 'OnClearBootRecords',
    ApplyCustomZip: 'OnApplyCustomZip',
    DisableCustomZip: 'OnDisableCustomZip',
    FetchCustomZipStatus: 'OnFetchCustomZipStatus',
    ClearConfigValue: 'OnClearConfigValue',
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
    FetchLogUploadQueue: 'OnFetchLogUploadQueue',
    AckLogUploadQueue: 'OnAckLogUploadQueue',
    ClearLogUploadQueue: 'OnClearLogUploadQueue',
    FetchPendingReports: 'OnFetchPendingReports',
    AckPendingReports: 'OnAckPendingReports',
    SendBootMetrics: 'OnSendBootMetrics',
    SetDebugMode: 'OnSetDebugMode',
    Ping: 'Pong',
    FetchTestRecord: 'OnFetchTestRecord',
    FetchAllTestRecords: 'OnFetchAllTestRecords',
    SaveTestRecord: 'OnSaveTestRecord',
    SaveAllTestRecords: 'OnSaveAllTestRecords',
    ClearTestRecords: 'OnClearTestRecords',
    StartUpdateDownload: 'OnStartUpdateDownload',
    RestartToUpdate: 'OnRestartToUpdate',
    CheckAppUpdate: 'OnCheckAppUpdate',
    OpenStore: 'OnOpenStore',
} as const satisfies Record<WebMessageType, AppMessageType>;

export type WebMessageResponseTypeMap = typeof WEB_MESSAGE_RESPONSE_TYPE;

export type WebMessageResponseType<K extends WebMessageType> = WebMessageResponseTypeMap[K];

/** The response type the caller receives when a web client request resolves. Failures are rejected as BridgeError. */
export type WebMessageResponse<K extends WebMessageType> = AppSuccessMessage<WebMessageResponseType<K>>;

/** Used when the native handler function itself wants to strictly pin the return type down to the payload. */
export type WebMessageAppResponse<K extends WebMessageType> = AppResponseMessage<WebMessageResponseType<K>>;

/** A strict handler type for preserving request/response type inference in individual handler declarations, such as with useCallback. */
export type WebMessageAppHandler<K extends WebMessageType> = (
    message: WebMessageRequest<K>
) => Promise<WebMessageAppResponse<K>>;

/**
 * The response type a native handler returns to the bridge host.
 * At the handler stage, refId/version haven't been injected yet, and some domain payloads
 * can lose their union correlation, so only the response message type is strictly pinned;
 * `data` is validated at the host/client boundary instead.
 */
export type WebMessageHandlerResponse<K extends WebMessageType> = BaseMessage & {
    type: WebMessageResponseType<K>;
    success: boolean;
    data?: unknown;
    error?: AppMessageError;
};

/** The standard signature for a native handler that processes a specific WebMessage request. */
export type WebMessageHandler<K extends WebMessageType> = (
    message: WebMessageRequest<K>
) => WebMessageHandlerResponse<K> | Promise<WebMessageHandlerResponse<K>>;

/** A map for validating each request's handler response type in a central router such as useWebMessageRouter. */
export type WebMessageHandlerMap = {
    [K in WebMessageType]?: WebMessageHandler<K>;
};

/** Error codes that occur at the bridge boundary. Allows string extension to preserve domain handler error codes. */
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
    /** An internal description for classifying the cause in logs/observability, separate from the human-readable message. */
    reason?: string;
    /** An identifier for correlating the same bridge failure across different log systems. */
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

/** A bridge-level failure response that doesn't belong to the AppMessage union. */
export type BridgeErrorResponse = BaseMessage & {
    type: 'ERROR';
    success: false;
    error: BridgeError;
};

/** The full set of responses that can come in through a bridge adapter. */
export type BridgeResponseMessage<K extends WebMessageType = WebMessageType> =
    | WebMessageHandlerResponse<K>
    | BridgeErrorResponse;

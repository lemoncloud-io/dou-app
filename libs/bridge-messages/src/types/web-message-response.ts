import type { AppMessageError, AppMessageType, AppResponseMessage, AppSuccessMessage } from './app-message';
import type { BaseMessage } from './types';
import type { WebMessageData, WebMessageType } from './web-message';

export type WebMessageRequest<K extends WebMessageType> = WebMessageData<K>;

export const WEB_MESSAGE_RESPONSE_TYPE = {
    SetCanGoBack: 'OnSetCanGoBack',
    OpenSettings: 'OnOpenSettings',
    StartFileTransfer: 'OnStartFileTransfer',
    CancelFileTransfer: 'OnCancelFileTransfer',
    ListFileTransfers: 'OnListFileTransfers',
    AckFileTransfers: 'OnAckFileTransfers',
    WriteTempFile: 'OnWriteTempFile',
    CreateDummyFile: 'OnCreateDummyFile',
    OpenShareSheet: 'OnOpenShareSheet',
    GetContacts: 'OnGetContacts',
    OpenDocument: 'OnOpenDocument',
    OpenCamera: 'OnOpenCamera',
    OpenPhotoLibrary: 'OnOpenPhotoLibrary',
    ListPhotoAlbums: 'OnListPhotoAlbums',
    ListPhotos: 'OnListPhotos',
    ReadPhoto: 'OnReadPhoto',
    KeepLibraryVideo: 'OnKeepLibraryVideo',
    ManagePhotoSelection: 'OnManagePhotoSelection',
    SaveToPhotoLibrary: 'OnSaveToPhotoLibrary',
    ShareFile: 'OnShareFile',
    OpenFile: 'OnOpenFile',
    SaveFile: 'OnSaveFile',
    PickAttachments: 'OnPickAttachments',
    PrepareVideo: 'OnPrepareVideo',
    ReadAttachment: 'OnReadAttachment',
    ReadVideoFrame: 'OnReadVideoFrame',
    StartAudioRecording: 'OnAudioRecordingStarted',
    StopAudioRecording: 'OnAudioRecordingEnded',
    FetchShareIntake: 'OnFetchShareIntake',
    ReleaseShareIntake: 'OnReleaseShareIntake',
    StorageGet: 'OnStorageGet',
    StorageSave: 'OnStorageSave',
    StorageClear: 'OnStorageClear',
    RequestPermission: 'OnRequestPermission',
    OpenURL: 'OnOpenURL',
    SendSms: 'OnSendSms',
    FetchAppIcon: 'OnFetchAppIcon',
    FetchAppIconList: 'OnFetchAppIconList',
    ChangeAppIcon: 'OnChangeAppIcon',
    CopyToClipboard: 'OnCopyToClipboard',
    TriggerHaptic: 'OnTriggerHaptic',
    DismissResumeOverlay: 'OnDismissResumeOverlay',
    FirstScreenReady: 'OnFirstScreenReady',
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
    FetchChatMediaCacheData: 'OnFetchChatMediaCacheData',
    CountChatMediaCacheData: 'OnCountChatMediaCacheData',
    SaveChatMediaCacheData: 'OnSaveChatMediaCacheData',
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
    FetchNativeStorageSummary: 'OnFetchNativeStorageSummary',
    ClearNativeCache: 'OnClearNativeCache',
    ClearConfigValue: 'OnClearConfigValue',
    WebAppReady: 'OnWebAppReady',
    SendLog: 'OnSendLog',
    FetchLogUploadQueue: 'OnFetchLogUploadQueue',
    AckLogUploadQueue: 'OnAckLogUploadQueue',
    ClearLogUploadQueue: 'OnClearLogUploadQueue',
    FetchPendingReports: 'OnFetchPendingReports',
    AckPendingReports: 'OnAckPendingReports',
    SendBootMetrics: 'OnSendBootMetrics',
    SetDebugMode: 'OnSetDebugMode',
    StartPerfTrace: 'OnStartPerfTrace',
    StopPerfTrace: 'OnStopPerfTrace',
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
    OpenSubWebView: 'OnOpenSubWebView',
    CloseSubWebView: 'OnCloseSubWebView',
    FinishSubWebView: 'OnFinishSubWebView',
    SetSubWebViewTitle: 'OnSetSubWebViewTitle',
    GetSubWebViewUserKey: 'OnGetSubWebViewUserKey',
    SetSubWebViewCloseGuard: 'OnSetSubWebViewCloseGuard',
    ReportSubWebViewError: 'OnReportSubWebViewError',
    GetSubWebViewStorage: 'OnGetSubWebViewStorage',
    SetSubWebViewStorage: 'OnSetSubWebViewStorage',
    RemoveSubWebViewStorage: 'OnRemoveSubWebViewStorage',
    ClearSubWebViewStorage: 'OnClearSubWebViewStorage',
    GetSubWebViewStorageInfo: 'OnGetSubWebViewStorageInfo',
    GetSubWebViewPermission: 'OnGetSubWebViewPermission',
    RequestSubWebViewPermission: 'OnRequestSubWebViewPermission',
    RuntimeHello: 'OnRuntimeHello',
    RuntimeCall: 'OnRuntimeCall',
    RuntimeSubscribe: 'OnRuntimeSubscribe',
    RuntimeUnsubscribe: 'OnRuntimeUnsubscribe',
    FetchSessionOwner: 'OnFetchSessionOwner',
    SetSessionOwner: 'OnSetSessionOwner',
    SetDefaultSessionOwner: 'OnSetDefaultSessionOwner',
} as const satisfies Record<WebMessageType, AppMessageType>;

export type WebMessageResponseTypeMap = typeof WEB_MESSAGE_RESPONSE_TYPE;

export type WebMessageResponseType<K extends WebMessageType> = WebMessageResponseTypeMap[K];

export type WebMessageResponse<K extends WebMessageType> = AppSuccessMessage<WebMessageResponseType<K>>;

export type WebMessageAppResponse<K extends WebMessageType> = AppResponseMessage<WebMessageResponseType<K>>;

export type WebMessageAppHandler<K extends WebMessageType> = (
    message: WebMessageRequest<K>
) => Promise<WebMessageAppResponse<K>>;

export type WebMessageHandlerResponse<K extends WebMessageType> = BaseMessage & {
    type: WebMessageResponseType<K>;
    success: boolean;
    data?: unknown;
    error?: AppMessageError;
};

export type WebMessageHandler<K extends WebMessageType> = (
    message: WebMessageRequest<K>
) => WebMessageHandlerResponse<K> | Promise<WebMessageHandlerResponse<K>>;

export type WebMessageHandlerMap = {
    [K in WebMessageType]?: WebMessageHandler<K>;
};

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
    reason?: string;
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

export type BridgeErrorResponse = BaseMessage & {
    type: 'ERROR';
    success: false;
    error: BridgeError;
};

export type BridgeResponseMessage<K extends WebMessageType = WebMessageType> =
    | WebMessageHandlerResponse<K>
    | BridgeErrorResponse;

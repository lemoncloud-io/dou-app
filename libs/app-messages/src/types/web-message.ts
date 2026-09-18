import type {
    ChangeAppIconPayload,
    CheckAppUpdatePayload,
    ClearCacheDataByChannelPayload,
    ClearCacheDataPayload,
    ClearConfigValuePayload,
    ClearTestRecordsPayload,
    DeleteAllCacheDataPayload,
    DeleteCacheDataPayload,
    DeletePreferencePayload,
    FetchAllCacheDataPayload,
    FetchAllTestRecordsPayload,
    AckLogUploadQueuePayload,
    ClearLogUploadQueuePayload,
    AckPendingReportsPayload,
    FetchAppLogBufferPayload,
    FetchLogUploadQueuePayload,
    FetchCacheDataPayload,
    FetchLastChatsDataPayload,
    FetchManyCacheDataPayload,
    FetchPendingReportsPayload,
    FetchPreferencePayload,
    FetchTestRecordPayload,
    FinishPurchaseTransactionPayload,
    OAuthLoginPayload,
    OAuthLogoutPayload,
    OpenCameraPayload,
    OpenDocumentPayload,
    OpenModalPayload,
    OpenPhotoLibraryPayload,
    OpenShareSheetPayload,
    OpenURLPayload,
    PingPayload,
    PollAppLogBufferPayload,
    PurchasePayload,
    RequestPermissionPayload,
    SaveAllCacheDataPayload,
    SaveAllTestRecordsPayload,
    SaveCacheDataPayload,
    ApplyCustomZipPayload,
    ClearBootRecordsPayload,
    DeleteFcmTokenPayload,
    DisableCustomZipPayload,
    FetchBootRecordsPayload,
    FetchCustomZipStatusPayload,
    SaveConfigValuePayload,
    SavePreferencePayload,
    SaveTestRecordPayload,
    SearchGlobalCacheDataPayload,
    SendLogPayload,
    SendSmsPayload,
    SetBadgeCountPayload,
    SetCanGoBackPayload,
    RequestFileUploadPayload,
    PauseFileUploadPayload,
    ResumeFileUploadPayload,
    CancelFileUploadPayload,
    RecoverUploadPayload,
    RetryUploadPayload,
    CreateDummyFilePayload,
    CloseModalPayload,
    OpenSettingsPayload,
    OpenStorePayload,
    ListRecoverableUploadsPayload,
    GetContactsPayload,
    FetchSafeAreaPayload,
    FetchBackgroundStatusPayload,
    FetchAppIconPayload,
    FetchAppIconListPayload,
    FetchFcmTokenPayload,
    FetchBadgeBasePayload,
    FetchBadgeCountPayload,
    FetchPushMarksPayload,
    ShowNotificationPayload,
    FetchUrlMetadataPayload,
    FetchProductsPayload,
    FetchCurrentPurchasesPayload,
    OpenSubscriptionManagementPayload,
    WebAppReadyPayload,
    ShowLoaderPayload,
    HideLoaderPayload,
    SyncCredentialPayload,
    PopWebViewPayload,
    ClearAppLogBufferPayload,
    FetchAppLogBufferSizePayload,
    CopyToClipboardPayload,
    DismissResumeOverlayPayload,
    StartUpdateDownloadPayload,
    RestartToUpdatePayload,
    SendBootMetricsPayload,
    SetDebugModePayload,
} from './model';
import type { BaseMessage } from './types';

/** Structure mapping each message type to its corresponding payload type. */
export type WebMessagePayloadMap = {
    // 1. Device & System
    SetCanGoBack: SetCanGoBackPayload;
    OpenModal: OpenModalPayload;
    CloseModal: CloseModalPayload;
    OpenSettings: OpenSettingsPayload;
    RequestFileUpload: RequestFileUploadPayload;
    PauseFileUpload: PauseFileUploadPayload;
    ResumeFileUpload: ResumeFileUploadPayload;
    CancelFileUpload: CancelFileUploadPayload;
    ListRecoverableUploads: ListRecoverableUploadsPayload;
    RecoverUpload: RecoverUploadPayload;
    RetryUpload: RetryUploadPayload;
    CreateDummyFile: CreateDummyFilePayload;

    OpenShareSheet: OpenShareSheetPayload;
    GetContacts: GetContactsPayload;
    OpenDocument: OpenDocumentPayload;
    OpenCamera: OpenCameraPayload;
    OpenPhotoLibrary: OpenPhotoLibraryPayload;
    FetchSafeArea: FetchSafeAreaPayload;
    FetchBackgroundStatus: FetchBackgroundStatusPayload;
    RequestPermission: RequestPermissionPayload;
    OpenURL: OpenURLPayload;
    SendSms: SendSmsPayload;
    FetchAppIcon: FetchAppIconPayload;
    FetchAppIconList: FetchAppIconListPayload;
    ChangeAppIcon: ChangeAppIconPayload;

    // 2. Notification
    FetchFcmToken: FetchFcmTokenPayload;
    FetchBadgeCount: FetchBadgeCountPayload;
    FetchBadgeBase: FetchBadgeBasePayload;
    FetchPushMarks: FetchPushMarksPayload;
    SetBadgeCount: SetBadgeCountPayload;
    ShowNotification: ShowNotificationPayload;
    FetchUrlMetadata: FetchUrlMetadataPayload;

    // 3. IAP
    FetchProducts: FetchProductsPayload;
    FetchCurrentPurchases: FetchCurrentPurchasesPayload;
    Purchase: PurchasePayload;
    FinishPurchaseTransaction: FinishPurchaseTransactionPayload;
    OpenSubscriptionManagement: OpenSubscriptionManagementPayload;

    // 4. Cache
    FetchCacheData: FetchCacheDataPayload;
    FetchManyCacheData: FetchManyCacheDataPayload;
    FetchLastChatsData: FetchLastChatsDataPayload;
    FetchAllCacheData: FetchAllCacheDataPayload;
    SaveCacheData: SaveCacheDataPayload;
    SaveAllCacheData: SaveAllCacheDataPayload;
    DeleteCacheData: DeleteCacheDataPayload;
    DeleteAllCacheData: DeleteAllCacheDataPayload;
    ClearCacheData: ClearCacheDataPayload;
    ClearCacheDataByChannel: ClearCacheDataByChannelPayload;
    SearchGlobalCacheData: SearchGlobalCacheDataPayload;

    // 5. Preference
    FetchPreference: FetchPreferencePayload;
    SavePreference: SavePreferencePayload;
    DeletePreference: DeletePreferencePayload;

    // 6. Auth
    OAuthLogin: OAuthLoginPayload;
    OAuthLogout: OAuthLogoutPayload;

    // 6.5 Config (ADR-0079 shell lane — general-purpose KV bridge)
    SaveConfigValue: SaveConfigValuePayload;
    ClearConfigValue: ClearConfigValuePayload;

    // 6.6 Debug panel (ADR-0080 decision 11 — control on web, execution on app)
    DeleteFcmToken: DeleteFcmTokenPayload;
    FetchBootRecords: FetchBootRecordsPayload;
    ClearBootRecords: ClearBootRecordsPayload;
    ApplyCustomZip: ApplyCustomZipPayload;
    DisableCustomZip: DisableCustomZipPayload;
    FetchCustomZipStatus: FetchCustomZipStatusPayload;

    // 7. Common & Others
    WebAppReady: WebAppReadyPayload;
    ShowLoader: ShowLoaderPayload;
    HideLoader: HideLoaderPayload;
    SyncCredential: SyncCredentialPayload;
    PopWebView: PopWebViewPayload;
    FetchAppLogBuffer: FetchAppLogBufferPayload;
    PollAppLogBuffer: PollAppLogBufferPayload;
    ClearAppLogBuffer: ClearAppLogBufferPayload;
    FetchAppLogBufferSize: FetchAppLogBufferSizePayload;
    SendLog: SendLogPayload;
    FetchLogUploadQueue: FetchLogUploadQueuePayload;
    AckLogUploadQueue: AckLogUploadQueuePayload;
    ClearLogUploadQueue: ClearLogUploadQueuePayload;
    FetchPendingReports: FetchPendingReportsPayload;
    AckPendingReports: AckPendingReportsPayload;
    Ping: PingPayload;
    CopyToClipboard: CopyToClipboardPayload;
    DismissResumeOverlay: DismissResumeOverlayPayload;
    SendBootMetrics: SendBootMetricsPayload;
    SetDebugMode: SetDebugModePayload;

    // 8. Test DB Scenario Validation
    FetchTestRecord: FetchTestRecordPayload;
    FetchAllTestRecords: FetchAllTestRecordsPayload;
    SaveTestRecord: SaveTestRecordPayload;
    SaveAllTestRecords: SaveAllTestRecordsPayload;
    ClearTestRecords: ClearTestRecordsPayload;

    // 9. Auto Update (desktop)
    StartUpdateDownload: StartUpdateDownloadPayload;
    RestartToUpdate: RestartToUpdatePayload;

    // 10. App Update (mobile)
    CheckAppUpdate: CheckAppUpdatePayload;
    OpenStore: OpenStorePayload;
};

/** Auto-generates the string union of every possible web message type from the keys of WebMessagePayloadMap. */
export type WebMessageType = keyof WebMessagePayloadMap;

export type WebDefaultMessage<T extends WebMessageType> = BaseMessage & {
    type: T;
    data: WebMessagePayloadMap[T];
};

export type WebMessageData<T extends WebMessageType> = WebDefaultMessage<T>;

export type WebMessage = {
    [K in WebMessageType]: WebDefaultMessage<K>;
}[WebMessageType];

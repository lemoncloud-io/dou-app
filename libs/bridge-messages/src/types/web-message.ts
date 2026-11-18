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
    OpenPhotoLibraryPayload,
    OpenShareSheetPayload,
    OpenURLPayload,
    PingPayload,
    PurchasePayload,
    RequestPermissionPayload,
    SaveAllCacheDataPayload,
    SaveAllTestRecordsPayload,
    SaveCacheDataPayload,
    ApplyCustomZipPayload,
    ClearBootRecordsPayload,
    ClearNativeCachePayload,
    DeleteFcmTokenPayload,
    DisableCustomZipPayload,
    FetchBootRecordsPayload,
    FetchCustomZipStatusPayload,
    FetchNativeStorageSummaryPayload,
    SaveConfigValuePayload,
    SavePreferencePayload,
    SaveTestRecordPayload,
    SearchGlobalCacheDataPayload,
    FetchChatMediaCacheDataPayload,
    CountChatMediaCacheDataPayload,
    SaveChatMediaCacheDataPayload,
    SendLogPayload,
    SendSmsPayload,
    SetBadgeCountPayload,
    SetCanGoBackPayload,
    CreateDummyFilePayload,
    StartFileTransferPayload,
    CancelFileTransferPayload,
    ListFileTransfersPayload,
    AckFileTransfersPayload,
    WriteTempFilePayload,
    ListPhotoAlbumsPayload,
    ListPhotosPayload,
    ReadPhotoPayload,
    KeepLibraryVideoPayload,
    ManagePhotoSelectionPayload,
    SaveToPhotoLibraryPayload,
    ShareFilePayload,
    OpenFilePayload,
    SaveFilePayload,
    PickAttachmentsPayload,
    PrepareVideoPayload,
    ReadAttachmentPayload,
    ReadVideoFramePayload,
    StartAudioRecordingPayload,
    StopAudioRecordingPayload,
    FetchShareIntakePayload,
    ReleaseShareIntakePayload,
    StorageClearPayload,
    StorageGetPayload,
    StorageSavePayload,
    OpenSettingsPayload,
    OpenStorePayload,
    OpenSubWebViewPayload,
    CloseSubWebViewPayload,
    FinishMiniAppPayload,
    SetMiniAppTitlePayload,
    GetMiniAppUserKeyPayload,
    SetMiniAppCloseGuardPayload,
    ReportMiniAppErrorPayload,
    GetMiniAppStoragePayload,
    SetMiniAppStoragePayload,
    RemoveMiniAppStoragePayload,
    ClearMiniAppStoragePayload,
    GetMiniAppStorageInfoPayload,
    GetMiniAppPermissionPayload,
    RequestMiniAppPermissionPayload,
    GetContactsPayload,
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
    CopyToClipboardPayload,
    TriggerHapticPayload,
    DismissResumeOverlayPayload,
    FirstScreenReadyPayload,
    StartUpdateDownloadPayload,
    RestartToUpdatePayload,
    SendBootMetricsPayload,
    SetDebugModePayload,
    StartPerfTracePayload,
    StopPerfTracePayload,
    RuntimeCallPayload,
    RuntimeHelloPayload,
    RuntimeSubscribePayload,
    RuntimeUnsubscribePayload,
    FetchSessionOwnerPayload,
    SetSessionOwnerPayload,
    SetDefaultSessionOwnerPayload,
} from './model';
import type { BaseMessage } from './types';

/** Structure mapping each message type to its corresponding payload type. */
export type WebMessagePayloadMap = {
    // 1. Device & System
    SetCanGoBack: SetCanGoBackPayload;
    OpenSettings: OpenSettingsPayload;
    StartFileTransfer: StartFileTransferPayload;
    CancelFileTransfer: CancelFileTransferPayload;
    ListFileTransfers: ListFileTransfersPayload;
    AckFileTransfers: AckFileTransfersPayload;
    WriteTempFile: WriteTempFilePayload;
    CreateDummyFile: CreateDummyFilePayload;

    OpenShareSheet: OpenShareSheetPayload;
    GetContacts: GetContactsPayload;
    OpenDocument: OpenDocumentPayload;
    OpenCamera: OpenCameraPayload;
    OpenPhotoLibrary: OpenPhotoLibraryPayload;
    // In-app photo picker. Newer than most shells: an older one answers NOT_FOUND, and the web falls
    // back to its own file input.
    ListPhotoAlbums: ListPhotoAlbumsPayload;
    ListPhotos: ListPhotosPayload;
    ReadPhoto: ReadPhotoPayload;
    ManagePhotoSelection: ManagePhotoSelectionPayload;
    // Copy a library video into the shell's pick folder. Newer than the photo grid: the web learns a
    // shell without it from `NOT_FOUND`, and lists photos only.
    KeepLibraryVideo: KeepLibraryVideoPayload;
    // Hand a downloaded file to the photo library or the share sheet. Newer than most shells: the web
    // shows the controls only when the handshake lists both.
    SaveToPhotoLibrary: SaveToPhotoLibraryPayload;
    ShareFile: ShareFilePayload;
    // Open a downloaded document in the OS preview, or keep it in the device's downloads. Newer than
    // the two above: the web learns a shell without them from `NOT_FOUND`.
    OpenFile: OpenFilePayload;
    SaveFile: SaveFilePayload;
    // Pick a video or document the shell keeps, and make a picked video ready to upload. A shell
    // without them answers `NOT_FOUND`, and the web uses its own file input instead.
    PickAttachments: PickAttachmentsPayload;
    PrepareVideo: PrepareVideoPayload;
    ReadAttachment: ReadAttachmentPayload;
    // A received video's first frame, made by the shell from its address. A shell without it answers
    // `NOT_FOUND`, and the web draws the tile another way or leaves it grey.
    ReadVideoFrame: ReadVideoFramePayload;
    // A voice message, recorded by the shell into its pick folder. The web offers the microphone only
    // when the handshake lists `StartAudioRecording`.
    StartAudioRecording: StartAudioRecordingPayload;
    StopAudioRecording: StopAudioRecordingPayload;
    // What another app shared through the OS share sheet, by the id the share URL carried. A shell
    // without it answers `NOT_FOUND`, and the share page has nothing to show.
    FetchShareIntake: FetchShareIntakePayload;
    ReleaseShareIntake: ReleaseShareIntakePayload;
    StorageGet: StorageGetPayload;
    StorageSave: StorageSavePayload;
    StorageClear: StorageClearPayload;
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
    FetchChatMediaCacheData: FetchChatMediaCacheDataPayload;
    CountChatMediaCacheData: CountChatMediaCacheDataPayload;
    SaveChatMediaCacheData: SaveChatMediaCacheDataPayload;

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
    FetchNativeStorageSummary: FetchNativeStorageSummaryPayload;
    ClearNativeCache: ClearNativeCachePayload;

    // 7. Common & Others
    WebAppReady: WebAppReadyPayload;
    SendLog: SendLogPayload;
    FetchLogUploadQueue: FetchLogUploadQueuePayload;
    AckLogUploadQueue: AckLogUploadQueuePayload;
    ClearLogUploadQueue: ClearLogUploadQueuePayload;
    FetchPendingReports: FetchPendingReportsPayload;
    AckPendingReports: AckPendingReportsPayload;
    Ping: PingPayload;
    CopyToClipboard: CopyToClipboardPayload;
    TriggerHaptic: TriggerHapticPayload;
    DismissResumeOverlay: DismissResumeOverlayPayload;
    FirstScreenReady: FirstScreenReadyPayload;
    SendBootMetrics: SendBootMetricsPayload;
    SetDebugMode: SetDebugModePayload;
    StartPerfTrace: StartPerfTracePayload;
    StopPerfTrace: StopPerfTracePayload;

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

    // 11. Sub WebView. Newer than most shells: the web asks only when the handshake lists it.
    OpenSubWebView: OpenSubWebViewPayload;
    CloseSubWebView: CloseSubWebViewPayload;
    // Sent by a sub WebView page to the sub WebView's own host, never by the main web.
    FinishMiniApp: FinishMiniAppPayload;
    SetMiniAppTitle: SetMiniAppTitlePayload;
    GetMiniAppUserKey: GetMiniAppUserKeyPayload;
    SetMiniAppCloseGuard: SetMiniAppCloseGuardPayload;
    ReportMiniAppError: ReportMiniAppErrorPayload;
    GetMiniAppStorage: GetMiniAppStoragePayload;
    SetMiniAppStorage: SetMiniAppStoragePayload;
    RemoveMiniAppStorage: RemoveMiniAppStoragePayload;
    ClearMiniAppStorage: ClearMiniAppStoragePayload;
    GetMiniAppStorageInfo: GetMiniAppStorageInfoPayload;
    GetMiniAppPermission: GetMiniAppPermissionPayload;
    RequestMiniAppPermission: RequestMiniAppPermissionPayload;
    // 12. Runtime. The main web's conversation with a shell that owns the session; asked only of a
    // shell that offered it in `window.CHATIC_APP_RUNTIME`.
    RuntimeHello: RuntimeHelloPayload;
    RuntimeCall: RuntimeCallPayload;
    RuntimeSubscribe: RuntimeSubscribePayload;
    RuntimeUnsubscribe: RuntimeUnsubscribePayload;
    // 13. Session owner. The owner switch, answered outside production or while the shell's debug mode is on.
    FetchSessionOwner: FetchSessionOwnerPayload;
    SetSessionOwner: SetSessionOwnerPayload;
    // The page's word on the owner of an install nobody switched, recorded for the next start; any build.
    SetDefaultSessionOwner: SetDefaultSessionOwnerPayload;
};

/** Auto-generates the string union of every possible web message type from the keys of WebMessagePayloadMap. */
export type WebMessageType = keyof WebMessagePayloadMap;

// Fails to compile when a name below is not a request in the map, so the subset cannot drift from it.
type RequestsIn<T extends WebMessageType> = T;

/**
 * The requests a sub WebView page may send: the only ones its host registers, so the only ones its
 * handshake lists. Each one is safe whoever sends it, or gets a handler of its own on that host
 * (`OpenURL` there opens only what the sub WebView would hand to the OS; `OpenShareSheet` shares only
 * text and a web link; `SetCanGoBack` claims Android back for the page alone). Nothing here reaches
 * the app's own storage, purchases or files: the storage requests reach only the page's own store,
 * and the one identifier, `GetMiniAppUserKey`, is a one-way key per origin, never the device id.
 * `OpenSettings` opens DoU's own page in the OS settings, for a device permission the OS has blocked.
 * The runtime requests read the app's data, and only through the read methods a page's manifest opens
 * — with `chatSend` (2.27.0), plus one plain text message to a room of its place.
 */
export type SubWebViewRequestType = RequestsIn<
    | 'WebAppReady'
    | 'Ping'
    | 'FinishMiniApp'
    | 'SetMiniAppTitle'
    | 'CopyToClipboard'
    | 'TriggerHaptic'
    | 'OpenURL'
    | 'OpenShareSheet'
    | 'GetMiniAppUserKey'
    | 'SetCanGoBack'
    | 'SetMiniAppCloseGuard'
    | 'ReportMiniAppError'
    | 'GetMiniAppStorage'
    | 'SetMiniAppStorage'
    | 'RemoveMiniAppStorage'
    | 'ClearMiniAppStorage'
    | 'GetMiniAppStorageInfo'
    | 'GetMiniAppPermission'
    | 'RequestMiniAppPermission'
    | 'OpenSettings'
    | SubWebViewRuntimeRequestType
>;

/**
 * (2.26.0) The runtime requests a sub WebView page may send — the main web's own four, answered on the
 * page's host by handlers written for it, which pass only the read methods the page's manifest opens
 * (`SubWebViewRuntimePermission`), and with `chatSend` one text send. Registered only where the app's runtime holds the session.
 */
export type SubWebViewRuntimeRequestType = RequestsIn<
    'RuntimeHello' | 'RuntimeCall' | 'RuntimeSubscribe' | 'RuntimeUnsubscribe'
>;

export type WebDefaultMessage<T extends WebMessageType> = BaseMessage & {
    type: T;
    data: WebMessagePayloadMap[T];
};

export type WebMessageData<T extends WebMessageType> = WebDefaultMessage<T>;

export type WebMessage = {
    [K in WebMessageType]: WebDefaultMessage<K>;
}[WebMessageType];

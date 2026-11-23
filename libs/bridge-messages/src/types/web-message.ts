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
    FinishSubWebViewPayload,
    SetSubWebViewTitlePayload,
    GetSubWebViewUserKeyPayload,
    SetSubWebViewCloseGuardPayload,
    ReportSubWebViewErrorPayload,
    GetSubWebViewStoragePayload,
    SetSubWebViewStoragePayload,
    RemoveSubWebViewStoragePayload,
    ClearSubWebViewStoragePayload,
    GetSubWebViewStorageInfoPayload,
    GetSubWebViewPermissionPayload,
    RequestSubWebViewPermissionPayload,
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

export type WebMessagePayloadMap = {
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
    ListPhotoAlbums: ListPhotoAlbumsPayload;
    ListPhotos: ListPhotosPayload;
    ReadPhoto: ReadPhotoPayload;
    ManagePhotoSelection: ManagePhotoSelectionPayload;
    KeepLibraryVideo: KeepLibraryVideoPayload;
    SaveToPhotoLibrary: SaveToPhotoLibraryPayload;
    ShareFile: ShareFilePayload;
    OpenFile: OpenFilePayload;
    SaveFile: SaveFilePayload;
    PickAttachments: PickAttachmentsPayload;
    PrepareVideo: PrepareVideoPayload;
    ReadAttachment: ReadAttachmentPayload;
    ReadVideoFrame: ReadVideoFramePayload;
    StartAudioRecording: StartAudioRecordingPayload;
    StopAudioRecording: StopAudioRecordingPayload;
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

    FetchFcmToken: FetchFcmTokenPayload;
    FetchBadgeCount: FetchBadgeCountPayload;
    FetchBadgeBase: FetchBadgeBasePayload;
    FetchPushMarks: FetchPushMarksPayload;
    SetBadgeCount: SetBadgeCountPayload;
    ShowNotification: ShowNotificationPayload;
    FetchUrlMetadata: FetchUrlMetadataPayload;

    FetchProducts: FetchProductsPayload;
    FetchCurrentPurchases: FetchCurrentPurchasesPayload;
    Purchase: PurchasePayload;
    FinishPurchaseTransaction: FinishPurchaseTransactionPayload;
    OpenSubscriptionManagement: OpenSubscriptionManagementPayload;

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

    FetchPreference: FetchPreferencePayload;
    SavePreference: SavePreferencePayload;
    DeletePreference: DeletePreferencePayload;

    OAuthLogin: OAuthLoginPayload;
    OAuthLogout: OAuthLogoutPayload;

    SaveConfigValue: SaveConfigValuePayload;
    ClearConfigValue: ClearConfigValuePayload;

    DeleteFcmToken: DeleteFcmTokenPayload;
    FetchBootRecords: FetchBootRecordsPayload;
    ClearBootRecords: ClearBootRecordsPayload;
    ApplyCustomZip: ApplyCustomZipPayload;
    DisableCustomZip: DisableCustomZipPayload;
    FetchCustomZipStatus: FetchCustomZipStatusPayload;
    FetchNativeStorageSummary: FetchNativeStorageSummaryPayload;
    ClearNativeCache: ClearNativeCachePayload;

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

    FetchTestRecord: FetchTestRecordPayload;
    FetchAllTestRecords: FetchAllTestRecordsPayload;
    SaveTestRecord: SaveTestRecordPayload;
    SaveAllTestRecords: SaveAllTestRecordsPayload;
    ClearTestRecords: ClearTestRecordsPayload;

    StartUpdateDownload: StartUpdateDownloadPayload;
    RestartToUpdate: RestartToUpdatePayload;

    CheckAppUpdate: CheckAppUpdatePayload;
    OpenStore: OpenStorePayload;

    OpenSubWebView: OpenSubWebViewPayload;
    CloseSubWebView: CloseSubWebViewPayload;
    FinishSubWebView: FinishSubWebViewPayload;
    SetSubWebViewTitle: SetSubWebViewTitlePayload;
    GetSubWebViewUserKey: GetSubWebViewUserKeyPayload;
    SetSubWebViewCloseGuard: SetSubWebViewCloseGuardPayload;
    ReportSubWebViewError: ReportSubWebViewErrorPayload;
    GetSubWebViewStorage: GetSubWebViewStoragePayload;
    SetSubWebViewStorage: SetSubWebViewStoragePayload;
    RemoveSubWebViewStorage: RemoveSubWebViewStoragePayload;
    ClearSubWebViewStorage: ClearSubWebViewStoragePayload;
    GetSubWebViewStorageInfo: GetSubWebViewStorageInfoPayload;
    GetSubWebViewPermission: GetSubWebViewPermissionPayload;
    RequestSubWebViewPermission: RequestSubWebViewPermissionPayload;
    RuntimeHello: RuntimeHelloPayload;
    RuntimeCall: RuntimeCallPayload;
    RuntimeSubscribe: RuntimeSubscribePayload;
    RuntimeUnsubscribe: RuntimeUnsubscribePayload;
    FetchSessionOwner: FetchSessionOwnerPayload;
    SetSessionOwner: SetSessionOwnerPayload;
    SetDefaultSessionOwner: SetDefaultSessionOwnerPayload;
};

export type WebMessageType = keyof WebMessagePayloadMap;

type RequestsIn<T extends WebMessageType> = T;

export type SubWebViewRequestType = RequestsIn<
    | 'WebAppReady'
    | 'Ping'
    | 'FinishSubWebView'
    | 'SetSubWebViewTitle'
    | 'CopyToClipboard'
    | 'TriggerHaptic'
    | 'OpenURL'
    | 'OpenShareSheet'
    | 'GetSubWebViewUserKey'
    | 'SetCanGoBack'
    | 'SetSubWebViewCloseGuard'
    | 'ReportSubWebViewError'
    | 'GetSubWebViewStorage'
    | 'SetSubWebViewStorage'
    | 'RemoveSubWebViewStorage'
    | 'ClearSubWebViewStorage'
    | 'GetSubWebViewStorageInfo'
    | 'GetSubWebViewPermission'
    | 'RequestSubWebViewPermission'
    | 'OpenSettings'
    | SubWebViewRuntimeRequestType
>;

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

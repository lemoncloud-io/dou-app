import type {
    ChangeAppIconPayload,
    ClearCacheDataPayload,
    ClearTestRecordsPayload,
    DeleteAllCacheDataPayload,
    DeleteCacheDataPayload,
    DeletePreferencePayload,
    FetchAllCacheDataPayload,
    FetchAllTestRecordsPayload,
    FetchAppLogBufferPayload,
    FetchCacheDataPayload,
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
    ListRecoverableUploadsPayload,
    GetContactsPayload,
    FetchSafeAreaPayload,
    FetchBackgroundStatusPayload,
    FetchAppIconPayload,
    FetchAppIconListPayload,
    FetchFcmTokenPayload,
    FetchBadgeCountPayload,
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
} from './model';
import type { BaseMessage } from './types';

/** 메시지 타입과 해당 Payload 타입을 매핑하는 구조입니다. */
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
    FetchAllCacheData: FetchAllCacheDataPayload;
    SaveCacheData: SaveCacheDataPayload;
    SaveAllCacheData: SaveAllCacheDataPayload;
    DeleteCacheData: DeleteCacheDataPayload;
    DeleteAllCacheData: DeleteAllCacheDataPayload;
    ClearCacheData: ClearCacheDataPayload;
    SearchGlobalCacheData: SearchGlobalCacheDataPayload;

    // 5. Preference
    FetchPreference: FetchPreferencePayload;
    SavePreference: SavePreferencePayload;
    DeletePreference: DeletePreferencePayload;

    // 6. Auth
    OAuthLogin: OAuthLoginPayload;
    OAuthLogout: OAuthLogoutPayload;

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
    Ping: PingPayload;
    CopyToClipboard: CopyToClipboardPayload;

    // 8. Test DB Scenario Validation
    FetchTestRecord: FetchTestRecordPayload;
    FetchAllTestRecords: FetchAllTestRecordsPayload;
    SaveTestRecord: SaveTestRecordPayload;
    SaveAllTestRecords: SaveAllTestRecordsPayload;
    ClearTestRecords: ClearTestRecordsPayload;
};

/** WebMessagePayloadMap의 Key들을 조합하여 가능한 모든 웹 메시지 타입(String Union)을 자동 생성합니다. */
export type WebMessageType = keyof WebMessagePayloadMap;

export type WebDefaultMessage<T extends WebMessageType> = BaseMessage & {
    type: T;
    data: WebMessagePayloadMap[T];
};

export type WebMessageData<T extends WebMessageType> = WebDefaultMessage<T>;

export type WebMessage = {
    [K in WebMessageType]: WebDefaultMessage<K>;
}[WebMessageType];

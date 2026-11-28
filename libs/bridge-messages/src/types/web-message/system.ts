import type {
    ChangeAppIconPayload,
    CopyToClipboardPayload,
    CreateDummyFilePayload,
    DismissResumeOverlayPayload,
    FetchAppIconListPayload,
    FetchAppIconPayload,
    FirstScreenReadyPayload,
    GetContactsPayload,
    OpenCameraPayload,
    OpenDocumentPayload,
    OpenPhotoLibraryPayload,
    OpenSettingsPayload,
    OpenShareSheetPayload,
    OpenURLPayload,
    PingPayload,
    RequestPermissionPayload,
    SendSmsPayload,
    SetCanGoBackPayload,
    TriggerHapticPayload,
    WebAppReadyPayload,
} from '../model';

export type SystemWebMessagePayloadMap = {
    SetCanGoBack: SetCanGoBackPayload;
    OpenSettings: OpenSettingsPayload;
    CreateDummyFile: CreateDummyFilePayload;
    OpenShareSheet: OpenShareSheetPayload;
    GetContacts: GetContactsPayload;
    OpenDocument: OpenDocumentPayload;
    OpenCamera: OpenCameraPayload;
    OpenPhotoLibrary: OpenPhotoLibraryPayload;
    RequestPermission: RequestPermissionPayload;
    OpenURL: OpenURLPayload;
    SendSms: SendSmsPayload;
    FetchAppIcon: FetchAppIconPayload;
    FetchAppIconList: FetchAppIconListPayload;
    ChangeAppIcon: ChangeAppIconPayload;
    WebAppReady: WebAppReadyPayload;
    Ping: PingPayload;
    CopyToClipboard: CopyToClipboardPayload;
    TriggerHaptic: TriggerHapticPayload;
    DismissResumeOverlay: DismissResumeOverlayPayload;
    FirstScreenReady: FirstScreenReadyPayload;
};

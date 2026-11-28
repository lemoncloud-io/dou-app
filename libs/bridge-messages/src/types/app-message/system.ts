import type {
    OnBackPressedPayload,
    OnBackgroundStatusChangedPayload,
    OnChangeAppIconPayload,
    OnCopyToClipboardPayload,
    OnCreateDummyFilePayload,
    OnDismissResumeOverlayPayload,
    OnFetchAppIconListPayload,
    OnFetchAppIconPayload,
    OnFirstScreenReadyPayload,
    OnGetContactsPayload,
    OnNavigatePayload,
    OnOpenCameraPayload,
    OnOpenDocumentPayload,
    OnOpenPhotoLibraryPayload,
    OnOpenSettingsPayload,
    OnOpenShareSheetPayload,
    OnOpenURLPayload,
    OnRequestPermissionPayload,
    OnSendSmsPayload,
    OnSetCanGoBackPayload,
    OnTriggerHapticPayload,
    OnUpdateDeviceInfoPayload,
    OnWebAppReadyPayload,
    PongPayload,
} from '../model';

export type SystemAppMessageDataMap = {
    OnUpdateDeviceInfo: OnUpdateDeviceInfoPayload;
    OnBackgroundStatusChanged: OnBackgroundStatusChangedPayload;
    OnSetCanGoBack: OnSetCanGoBackPayload;
    OnOpenSettings: OnOpenSettingsPayload;
    OnOpenShareSheet: OnOpenShareSheetPayload;
    OnCreateDummyFile: OnCreateDummyFilePayload;
    OnBackPressed: OnBackPressedPayload;
    OnOpenDocument: OnOpenDocumentPayload;
    OnGetContacts: OnGetContactsPayload;
    OnOpenCamera: OnOpenCameraPayload;
    OnOpenPhotoLibrary: OnOpenPhotoLibraryPayload;
    OnRequestPermission: OnRequestPermissionPayload;
    OnOpenURL: OnOpenURLPayload;
    OnNavigate: OnNavigatePayload;
    OnDismissResumeOverlay: OnDismissResumeOverlayPayload;
    OnFirstScreenReady: OnFirstScreenReadyPayload;
    OnSendSms: OnSendSmsPayload;
    OnFetchAppIcon: OnFetchAppIconPayload;
    OnFetchAppIconList: OnFetchAppIconListPayload;
    OnChangeAppIcon: OnChangeAppIconPayload;
    Pong: PongPayload;
    OnWebAppReady: OnWebAppReadyPayload;
    OnCopyToClipboard: OnCopyToClipboardPayload;
    OnTriggerHaptic: OnTriggerHapticPayload;
};

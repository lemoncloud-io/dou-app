import type {
    ClearSubWebViewStoragePayload,
    CloseSubWebViewPayload,
    FinishSubWebViewPayload,
    GetSubWebViewPermissionPayload,
    GetSubWebViewStorageInfoPayload,
    GetSubWebViewStoragePayload,
    GetSubWebViewUserKeyPayload,
    OpenSubWebViewPayload,
    RemoveSubWebViewStoragePayload,
    ReportSubWebViewErrorPayload,
    RequestSubWebViewPermissionPayload,
    SetSubWebViewCloseGuardPayload,
    SetSubWebViewStoragePayload,
    SetSubWebViewTitlePayload,
} from '../model';

export type SubWebViewWebMessagePayloadMap = {
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
};

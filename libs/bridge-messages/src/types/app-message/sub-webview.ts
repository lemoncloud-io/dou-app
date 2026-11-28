import type {
    OnClearSubWebViewStoragePayload,
    OnCloseSubWebViewPayload,
    OnFinishSubWebViewPayload,
    OnGetSubWebViewPermissionPayload,
    OnGetSubWebViewStorageInfoPayload,
    OnGetSubWebViewStoragePayload,
    OnGetSubWebViewUserKeyPayload,
    OnOpenSubWebViewPayload,
    OnRemoveSubWebViewStoragePayload,
    OnReportSubWebViewErrorPayload,
    OnRequestSubWebViewPermissionPayload,
    OnSetSubWebViewCloseGuardPayload,
    OnSetSubWebViewStoragePayload,
    OnSetSubWebViewTitlePayload,
    OnSubWebViewCloseRequestedPayload,
    OnSubWebViewClosedPayload,
    OnSubWebViewContextChangedPayload,
} from '../model';

export type SubWebViewAppMessageDataMap = {
    OnOpenSubWebView: OnOpenSubWebViewPayload;
    OnCloseSubWebView: OnCloseSubWebViewPayload;
    OnSubWebViewClosed: OnSubWebViewClosedPayload;
    OnFinishSubWebView: OnFinishSubWebViewPayload;
    OnSetSubWebViewTitle: OnSetSubWebViewTitlePayload;
    OnGetSubWebViewUserKey: OnGetSubWebViewUserKeyPayload;
    OnSetSubWebViewCloseGuard: OnSetSubWebViewCloseGuardPayload;
    OnReportSubWebViewError: OnReportSubWebViewErrorPayload;
    OnGetSubWebViewStorage: OnGetSubWebViewStoragePayload;
    OnSetSubWebViewStorage: OnSetSubWebViewStoragePayload;
    OnRemoveSubWebViewStorage: OnRemoveSubWebViewStoragePayload;
    OnClearSubWebViewStorage: OnClearSubWebViewStoragePayload;
    OnGetSubWebViewStorageInfo: OnGetSubWebViewStorageInfoPayload;
    OnGetSubWebViewPermission: OnGetSubWebViewPermissionPayload;
    OnRequestSubWebViewPermission: OnRequestSubWebViewPermissionPayload;
    OnSubWebViewContextChanged: OnSubWebViewContextChangedPayload;
    OnSubWebViewCloseRequested: OnSubWebViewCloseRequestedPayload;
};

import type { RuntimeWireValue } from './runtime';

export type SubWebViewOpenScope = 'reviewed' | 'anyHttps';

export type SubWebViewPermission = 'clipboard' | 'share' | 'openUrl' | 'userKey';

export type SubWebViewRuntimePermission =
    | 'session'
    | 'cloud'
    | 'place'
    | 'channel'
    | 'chat'
    | 'user'
    | 'chatSend'
    | 'chatReact';

export type SubWebViewManifestPermission = SubWebViewPermission | SubWebViewRuntimePermission;

export type SubWebViewDeviceKind = 'camera' | 'microphone';

export type SubWebViewDevicePermissionState = 'granted' | 'prompt' | 'blocked';

export type SubWebViewDisplay = 'titled' | 'clean' | 'immersive';

export type SubWebViewOrientation = 'any' | 'portrait' | 'landscape';

export type SubWebViewManifest = {
    manifestVersion: 1;
    name?: string;
    permissions?: SubWebViewManifestPermission[];
    display?: SubWebViewDisplay;
    orientation?: SubWebViewOrientation;
};

export type SubWebViewErrorCode = 'INVALID' | 'NOT_ALLOWED' | 'ALREADY_OPEN' | 'NOT_OPEN';

export type SubWebViewPageErrorCode =
    | 'NOT_FOUND'
    | 'INTERNAL_ERROR'
    | 'TOO_LARGE'
    | 'INVALID'
    | 'INVALID_KIND'
    | 'NOT_OPEN'
    | 'LINK_NOT_ALLOWED'
    | 'OPEN_URL_FAILED'
    | 'CLIPBOARD_WRITE_ERROR'
    | 'SHARE_ERROR'
    | 'UNAVAILABLE'
    | 'QUOTA_EXCEEDED'
    | 'SETTINGS_ERROR'
    | SubWebViewRuntimeErrorCode;

export type SubWebViewRuntimeErrorCode = 'RUNTIME_NOT_ALLOWED' | 'CLOUD_CHANGED' | 'CONSENT_REFUSED' | 'RATE_LIMITED';

export type SubWebViewRuntimeRefusalReason =
    | 'write'
    | 'cacheWrite'
    | 'cursor'
    | 'serverSideEffect'
    | 'otherCloud'
    | 'otherPlace'
    | 'account'
    | 'device'
    | 'admin'
    | 'internal'
    | 'notGranted'
    | 'guard'
    | 'unknown';

export type SubWebViewRuntimeRefusal = {
    target: string;
    method: string;
    reason: SubWebViewRuntimeRefusalReason;
};

export type OnSubWebViewRuntimeHelloPayload = {
    sessionOwner: 'native';
    contract: number;
    seq: number;
    session: RuntimeWireValue | null;
    allowed: { calls: string[]; streams: string[] };
};

export type SubWebViewCloseReason = 'user' | 'host' | 'system' | 'page';

export type SubWebViewParams = { [key: string]: unknown };

export type SubWebViewTheme = 'light' | 'dark';

export type SubWebViewSafeArea = { top: number; right: number; bottom: number; left: number };

export type SubWebViewContext = {
    protocolVersion: 1;
    viewId: string;
    platform: 'ios' | 'android' | 'desktop';
    appVersion: string;
    locale: string;
    theme: SubWebViewTheme;
    params: SubWebViewParams;
    appLink?: string;
    display?: SubWebViewDisplay;
    safeArea?: SubWebViewSafeArea;
};

export type OpenSubWebViewPayload = {
    url: string;
    title?: string;
    params?: SubWebViewParams;
    appId?: string;
};

export type MiniAppLaunchParams = {
    cloud: { id: string; name: string };
    place: { id: string; name: string } | null;
    user: { id: string; name: string; isOwner?: boolean };
    miniApps?: { id: string; name: string; host: string }[];
};

export type OnOpenSubWebViewPayload = {
    viewId: string;
};

export type CloseSubWebViewPayload = {
    viewId: string;
};

export type OnCloseSubWebViewPayload = {};

export type OnSubWebViewClosedPayload = {
    viewId: string;
    reason: SubWebViewCloseReason;
    result?: unknown;
};

export type FinishSubWebViewPayload = {
    result?: unknown;
};

export type OnFinishSubWebViewPayload = {};

export type SetSubWebViewTitlePayload = {
    title: string;
};

export type OnSetSubWebViewTitlePayload = {};

export type OnSubWebViewContextChangedPayload = Pick<SubWebViewContext, 'theme' | 'locale' | 'safeArea'>;

export type GetSubWebViewUserKeyPayload = {};

export type OnGetSubWebViewUserKeyPayload = {
    key: string;
};

export type SetSubWebViewCloseGuardPayload = {
    enabled: boolean;
};

export type OnSetSubWebViewCloseGuardPayload = {};

export type SubWebViewCloseTrigger = 'control' | 'back';

export type OnSubWebViewCloseRequestedPayload = {
    trigger: SubWebViewCloseTrigger;
};

export type ReportSubWebViewErrorPayload = {
    message: string;
    stack?: string;
};

export type OnReportSubWebViewErrorPayload = {
    recorded: boolean;
};

export type GetSubWebViewStoragePayload = {
    keys: string[];
};

export type OnGetSubWebViewStoragePayload = {
    entries: { [key: string]: unknown };
};

export type SetSubWebViewStoragePayload = {
    entries: { [key: string]: unknown };
};

export type SubWebViewStorageUsage = {
    used: number;
    limit: number;
};

export type OnSetSubWebViewStoragePayload = SubWebViewStorageUsage;

export type RemoveSubWebViewStoragePayload = {
    keys: string[];
};

export type OnRemoveSubWebViewStoragePayload = SubWebViewStorageUsage;

export type ClearSubWebViewStoragePayload = {};

export type OnClearSubWebViewStoragePayload = {};

export type GetSubWebViewStorageInfoPayload = {};

export type OnGetSubWebViewStorageInfoPayload = SubWebViewStorageUsage & {
    keys: string[];
};

export type GetSubWebViewPermissionPayload = {
    kind: SubWebViewDeviceKind;
};

export type OnGetSubWebViewPermissionPayload = {
    state: SubWebViewDevicePermissionState;
};

export type RequestSubWebViewPermissionPayload = {
    kind: SubWebViewDeviceKind;
};

export type OnRequestSubWebViewPermissionPayload = {
    state: SubWebViewDevicePermissionState;
};

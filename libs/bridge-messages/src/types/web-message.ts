import type { SystemWebMessagePayloadMap } from './web-message/system';
import type { FilesAndMediaWebMessagePayloadMap } from './web-message/files-and-media';
import type { CacheWebMessagePayloadMap } from './web-message/cache';
import type { SessionAndStorageWebMessagePayloadMap } from './web-message/session-and-storage';
import type { SubWebViewWebMessagePayloadMap } from './web-message/sub-webview';
import type { NotificationsAndPurchasesWebMessagePayloadMap } from './web-message/notifications-and-purchases';
import type { DiagnosticsWebMessagePayloadMap } from './web-message/diagnostics';
import type { JoinAreas, SharedKeys } from './area-map';
import type { BaseMessage } from './types';

type WebMessagePayloadAreas = [
    SystemWebMessagePayloadMap,
    FilesAndMediaWebMessagePayloadMap,
    CacheWebMessagePayloadMap,
    SessionAndStorageWebMessagePayloadMap,
    SubWebViewWebMessagePayloadMap,
    NotificationsAndPurchasesWebMessagePayloadMap,
    DiagnosticsWebMessagePayloadMap,
];

export type WebMessagePayloadMap = JoinAreas<WebMessagePayloadAreas, SharedKeys<WebMessagePayloadAreas>>;

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

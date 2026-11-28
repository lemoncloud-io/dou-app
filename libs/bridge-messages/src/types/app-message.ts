import type { SystemAppMessageDataMap } from './app-message/system';
import type { FilesAndMediaAppMessageDataMap } from './app-message/files-and-media';
import type { CacheAppMessageDataMap } from './app-message/cache';
import type { SessionAndStorageAppMessageDataMap } from './app-message/session-and-storage';
import type { SubWebViewAppMessageDataMap } from './app-message/sub-webview';
import type { NotificationsAndPurchasesAppMessageDataMap } from './app-message/notifications-and-purchases';
import type { DiagnosticsAppMessageDataMap } from './app-message/diagnostics';
import type { JoinAreas, SharedKeys } from './area-map';
import type { BaseMessage } from './types';

type AppMessageDataAreas = [
    SystemAppMessageDataMap,
    FilesAndMediaAppMessageDataMap,
    CacheAppMessageDataMap,
    SessionAndStorageAppMessageDataMap,
    SubWebViewAppMessageDataMap,
    NotificationsAndPurchasesAppMessageDataMap,
    DiagnosticsAppMessageDataMap,
];

export type AppMessageDataMap = JoinAreas<AppMessageDataAreas, SharedKeys<AppMessageDataAreas>>;

export type AppMessageType = keyof AppMessageDataMap;

export type AppMessageError = {
    code: string;
    message: string;
    details?: unknown;
};

export type AppSuccessMessage<T extends AppMessageType> = BaseMessage & {
    type: T;
    success: true;
    data: AppMessageDataMap[T];
    error?: never;
};

export type AppFailureMessage<T extends AppMessageType = AppMessageType> = BaseMessage & {
    type: T;
    success: false;
    error: AppMessageError;
    data?: Partial<AppMessageDataMap[T]>;
};

export type AppResponseMessage<T extends AppMessageType = AppMessageType> = AppSuccessMessage<T> | AppFailureMessage<T>;

export type AppDefaultMessage<T extends AppMessageType> = BaseMessage & {
    type: T;
    success: boolean;
    error?: AppMessageError;
    data: AppMessageDataMap[T];
};

export type AppMessageData<T extends AppMessageType> = AppDefaultMessage<T>;

export type AppMessage = {
    [K in AppMessageType]: AppDefaultMessage<K>;
}[AppMessageType];

/**
 * App Message:
 * message from App to Web
 */
import type { AppLogInfo, DeviceInfo, FcmTokenInfo, NotificationInfo, SafeAreaInfo, VersionInfo } from './common';

export const AppMessageTypes = {
    SyncCredential: 'SyncCredential',
    SetDeviceInfo: 'SetDeviceInfo',
    SetSafeArea: 'SetSafeArea',
    SetFcmToken: 'SetFcmToken',
    AppLog: 'AppLog',
    NotificationReceived: 'NotificationReceived',
    NotificationOpened: 'NotificationOpened',
} as const;
export type AppMessageType = (typeof AppMessageTypes)[keyof typeof AppMessageTypes];

interface DefaultMessage<T extends AppMessageType> {
    type: T;
}

export interface SetDeviceInfo extends DefaultMessage<'SetDeviceInfo'> {
    data: DeviceInfo & VersionInfo;
}

export interface SetSafeArea extends DefaultMessage<'SetSafeArea'> {
    data: SafeAreaInfo;
}

export interface SetFcmToken extends DefaultMessage<'SetFcmToken'> {
    data: FcmTokenInfo;
}

export interface AppLog extends DefaultMessage<'AppLog'> {
    data: AppLogInfo;
}

export interface NotificationReceived extends DefaultMessage<'NotificationReceived'> {
    data: NotificationInfo;
}

export interface NotificationOpened extends DefaultMessage<'NotificationOpened'> {
    data: NotificationInfo;
}

// prettier-ignore
export type AppMessageData<T extends AppMessageType>
    = T extends 'SetDeviceInfo' ? SetDeviceInfo
    : T extends 'SetSafeArea' ? SetSafeArea
    : T extends 'SetFcmToken' ? SetFcmToken
    : T extends 'AppLog' ? AppLog
    : T extends 'NotificationReceived' ? NotificationReceived
    : T extends 'NotificationOpened' ? NotificationOpened
    : DefaultMessage<T>

export type AppMessage = AppMessageData<AppMessageType>;

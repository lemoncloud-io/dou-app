/**
 * App Message:
 * message from App to Web
 */
import type { DeviceInfo, VersionInfo } from './common';

export const AppMessageTypes = {
    SuccessSetDeviceInfo: 'SuccessSetDeviceInfo',
    SuccessSyncCredential: 'SuccessSyncCredential',
} as const;
export type AppMessageType = (typeof AppMessageTypes)[keyof typeof AppMessageTypes];

interface DefaultMessage<T extends AppMessageType> {
    type: T;
}

// prettier-ignore
export interface SuccessSetDeviceInfoData<T extends 'SuccessSetDeviceInfo'> extends DefaultMessage<T> {
    data: DeviceInfo & VersionInfo;
}

// prettier-ignore
export type AppMessageData<T extends AppMessageType>
    = T extends 'SuccessSetDeviceInfo' ? SuccessSetDeviceInfoData<T>
    : DefaultMessage<T>;

export type AppMessage = AppMessageData<AppMessageType>;

import type { AppPermissionType, PermissionStatus } from '@chatic/bridge-messages';

export type { AppPermissionType };

export type RequestedPermissionStatus = Exclude<PermissionStatus, 'UNAVAILABLE'>;

export type DevicePermissionType = Exclude<AppPermissionType, 'NOTIFICATIONS'>;

export interface IPermissionService {
    check(type: AppPermissionType): Promise<boolean>;
    status(type: DevicePermissionType): Promise<PermissionStatus>;
    request(type: AppPermissionType): Promise<RequestedPermissionStatus>;
}

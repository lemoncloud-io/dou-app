export type AppPermissionType = 'CONTACTS' | 'NOTIFICATIONS' | 'CAMERA' | 'PHOTO_LIBRARY' | 'MICROPHONE';

export interface IPermissionService {
    check(type: AppPermissionType): Promise<boolean>;
    request(type: AppPermissionType): Promise<boolean>;
}

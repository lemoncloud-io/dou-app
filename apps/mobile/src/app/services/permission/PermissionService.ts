import { Platform } from 'react-native';
import {
    check,
    checkNotifications,
    PERMISSIONS,
    request,
    requestNotifications,
    RESULTS,
    type Permission,
    type PermissionStatus as PermissionResult,
} from 'react-native-permissions';
import type { AppPermissionType, IPermissionService, RequestedPermissionStatus } from './types';
import type { ILogService } from '../log';

const PERMISSION_MAP: Record<Exclude<AppPermissionType, 'NOTIFICATIONS'>, Permission | null> = {
    CONTACTS: Platform.select({
        ios: PERMISSIONS.IOS.CONTACTS,
        android: PERMISSIONS.ANDROID.READ_CONTACTS,
        default: null,
    }),
    CAMERA: Platform.select({
        ios: PERMISSIONS.IOS.CAMERA,
        android: PERMISSIONS.ANDROID.CAMERA,
        default: null,
    }),
    PHOTO_LIBRARY: Platform.select({
        ios: PERMISSIONS.IOS.PHOTO_LIBRARY,
        android:
            Number(Platform.Version) >= 33
                ? PERMISSIONS.ANDROID.READ_MEDIA_IMAGES
                : PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE,
        default: null,
    }),
    MICROPHONE: Platform.select({
        ios: PERMISSIONS.IOS.MICROPHONE,
        android: PERMISSIONS.ANDROID.RECORD_AUDIO,
        default: null,
    }),
};

// The blocked state is read from the request's own answer: on Android the library's `check` never
// reports BLOCKED (it only knows granted or not), while `request` does, once the OS stops showing
// the prompt. LIMITED (iOS photo library) is usable access.
const toRequestedStatus = (result: PermissionResult): RequestedPermissionStatus => {
    if (result === RESULTS.GRANTED || result === RESULTS.LIMITED) return 'GRANTED';
    if (result === RESULTS.BLOCKED) return 'BLOCKED';
    return 'DENIED';
};

export class PermissionService implements IPermissionService {
    constructor(private readonly logger: ILogService) {}

    async check(type: AppPermissionType): Promise<boolean> {
        try {
            if (type === 'NOTIFICATIONS') {
                const { status } = await checkNotifications();
                this.logger.info('PERMISSION', `Check ${type}: ${status}`);
                return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
            }

            const permission: Permission | null = PERMISSION_MAP[type];
            if (!permission) {
                this.logger.warn('PERMISSION', `Permission not supported on this platform: ${type}`);
                return true;
            }

            const result = await check(permission);
            this.logger.info('PERMISSION', `Check ${type}: ${result}`);
            // LIMITED (iOS photo library) is usable access: the request path already treats it
            // as granted, and reporting it denied here turns a Limited grant into a dead end.
            return result === RESULTS.GRANTED || result === RESULTS.LIMITED;
        } catch (error) {
            this.logger.error('PERMISSION', `Check failed: ${type}`, error);
            return false;
        }
    }

    async request(type: AppPermissionType): Promise<RequestedPermissionStatus> {
        try {
            const result =
                type === 'NOTIFICATIONS'
                    ? (await requestNotifications(['alert', 'sound', 'badge'])).status
                    : await this.requestMapped(type);
            this.logger.info('PERMISSION', `Request ${type}: ${result}`);
            return toRequestedStatus(result);
        } catch (error) {
            this.logger.error('PERMISSION', `Request failed: ${type}`, error);
            return 'DENIED';
        }
    }

    private async requestMapped(type: Exclude<AppPermissionType, 'NOTIFICATIONS'>): Promise<PermissionResult> {
        const permission: Permission | null = PERMISSION_MAP[type];
        if (!permission) {
            this.logger.warn('PERMISSION', `Permission not supported on this platform: ${type}`);
            return RESULTS.GRANTED;
        }
        return request(permission);
    }
}

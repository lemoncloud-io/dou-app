import { Platform } from 'react-native';
import {
    check,
    checkNotifications,
    PERMISSIONS,
    request,
    requestNotifications,
    RESULTS,
    type Permission,
} from 'react-native-permissions';
import type { AppPermissionType, IPermissionService } from './types';
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
            return result === RESULTS.GRANTED;
        } catch (error) {
            this.logger.error('PERMISSION', `Check failed: ${type}`, error);
            return false;
        }
    }

    async request(type: AppPermissionType): Promise<boolean> {
        try {
            if (type === 'NOTIFICATIONS') {
                const { status } = await requestNotifications(['alert', 'sound', 'badge']);
                this.logger.info('PERMISSION', `Request ${type}: ${status}`);

                if (status === RESULTS.BLOCKED) {
                    this.logger.warn('PERMISSION', `Request blocked: ${type}`);
                    return false;
                }
                return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
            }

            const permission: Permission | null = PERMISSION_MAP[type];
            if (!permission) {
                this.logger.warn('PERMISSION', `Permission not supported on this platform: ${type}`);
                return true;
            }

            const result = await request(permission);
            this.logger.info('PERMISSION', `Request ${type}: ${result}`);

            return result === RESULTS.GRANTED || result === RESULTS.LIMITED;
        } catch (error) {
            this.logger.error('PERMISSION', `Request failed: ${type}`, error);
            return false;
        }
    }
}

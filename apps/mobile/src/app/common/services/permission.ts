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

import { Logger } from './log';

/**
 * 앱에서 사용하는 권한 타입 정의
 * - CONTACT: 연락처
 * - NOTIFICATIONS: 알림
 * - CAMERA: 카메라
 * - PHOTO_LIBRARY: 갤러리
 * - MICROPHONE: 마이크
 */
export type AppPermissionType = 'CONTACTS' | 'NOTIFICATIONS' | 'CAMERA' | 'PHOTO_LIBRARY' | 'MICROPHONE';
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

export const PermissionService = {
    /**
     * 권한 상태 확인
     * - GRANTED: 허용됨
     * - DENIED: 거부됨 / 미결정 => 권한을 요청하지않은 초기상태
     * - BLOCKED: 차단됨 => '다시 묻지 않음'을 통해 거절한 케이스; 사용자가 직접 설정으로 이동시켜야함
     * - LIMITED: 제한적 허용 => iOS 환경에서 제한적으로 허용할 때 발생; ex: 선택한 사진만 허용
     */
    async check(type: AppPermissionType): Promise<boolean> {
        try {
            if (type === 'NOTIFICATIONS') {
                const { status } = await checkNotifications();
                Logger.info('PERMISSION', `Check ${type}: ${status}`);
                return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
            }

            const permission: Permission | null = PERMISSION_MAP[type];
            if (!permission) {
                Logger.warn('PERMISSION', `Permission not supported on this platform: ${type}`);
                return true;
            }

            const result = await check(permission);
            Logger.info('PERMISSION', `Check ${type}: ${result}`);
            return result === RESULTS.GRANTED;
        } catch (error) {
            Logger.error('PERMISSION', `Check failed: ${type}`, error);
            return false;
        }
    },

    /**
     * 권한 요청
     * - DENIED: 요청 팝업 뜸
     * - BLOCKED: 설정으로 이동 유도
     */
    async request(type: AppPermissionType): Promise<boolean> {
        try {
            if (type === 'NOTIFICATIONS') {
                const { status } = await requestNotifications(['alert', 'sound', 'badge']);
                Logger.info('PERMISSION', `Request ${type}: ${status}`);

                if (status === RESULTS.BLOCKED) {
                    Logger.warn('PERMISSION', `Request blocked: ${type}`);
                    return false;
                }
                return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
            }

            const permission: Permission | null = PERMISSION_MAP[type];
            if (!permission) {
                Logger.warn('PERMISSION', `Permission not supported on this platform: ${type}`);
                return true;
            }

            const result = await request(permission);
            Logger.info('PERMISSION', `Request ${type}: ${result}`);

            return result === RESULTS.GRANTED || result === RESULTS.LIMITED;
        } catch (error) {
            Logger.error('PERMISSION', `Request failed: ${type}`, error);
            return false;
        }
    },
};

import uuid from 'react-native-uuid';

import { STORAGE_KEYS, StorageService } from '../services';
import { USER_AGENT_PREFIX_IOS, USER_AGENT_PREFIX_ANDROID } from '@chatic/device-utils';

import DeviceInfo from 'react-native-device-info';
import { Platform } from 'react-native';
import Config from 'react-native-config';

/**
 * 플랫폼별 User Agent 식별자 접두사
 * - iOS: DOU_IOS
 * - Android: DOU_ANDROID
 */
export const APP_USER_AGENT_PREFIX = Platform.select({
    ios: USER_AGENT_PREFIX_IOS,
    android: USER_AGENT_PREFIX_ANDROID,
});

/**
 * Retrieves the unique device ID for the user.
 * Generates a random UUID if it doesn't already exist.
 * Managed and persisted via AsyncStorage.
 * @returns A promise that resolves to the device ID or null if an error occurs.
 * @author raine@lemoncloud.io
 */
export const getDeviceId = async (): Promise<string | null> => {
    try {
        const storedId = await StorageService.get<string>(STORAGE_KEYS.USER.DEVICE_ID);

        if (storedId) return storedId;

        const newId = uuid.v4().toString();
        await StorageService.set(STORAGE_KEYS.USER.DEVICE_ID, newId);

        return newId;
    } catch {
        return null;
    }
};

/**
 * UserAgent 불러오기
 * - 시스템 `UserAgent`에 앱 전용 `UserAgent`를 이어붙여 구성
 * - `APP_USER_AGENT_PREFIX` 포함여부를 바탕으로 플랫폼 환경 판단 가능
 */
export const getUserAgent = async (): Promise<string> => {
    const systemUserAgent = await DeviceInfo.getUserAgent();
    const appName = Config.VIEW_APP_NAME ?? '';

    const appVersion = DeviceInfo.getVersion();
    const buildNumber = DeviceInfo.getBuildNumber();
    const platform = Platform.OS === 'ios' ? 'iOS' : 'Android';

    return `${systemUserAgent} (${APP_USER_AGENT_PREFIX}; ${appName}/${appVersion}; ${platform}; Build:${buildNumber})`;
};

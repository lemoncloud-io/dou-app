import { USER_AGENT_PREFIX_ANDROID, USER_AGENT_PREFIX_IOS } from '@chatic/device-utils';

import DeviceInfo from 'react-native-device-info';
import { Platform } from 'react-native';
import Config from 'react-native-config';
import { getLocales } from 'react-native-localize';

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

/**
 * App Language 불러오기
 * - 디바이스에 설정된 언어 불러오기
 * - 기본값 'en'
 */
export const getAppLanguage = (): string => {
    const locales = getLocales();
    if (locales.length === 0) {
        return 'en';
    }
    return locales[0].languageCode;
};

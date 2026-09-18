import { USER_AGENT_PREFIX_ANDROID, USER_AGENT_PREFIX_IOS } from '@chatic/device-utils';

import DeviceInfo from 'react-native-device-info';
import { Platform } from 'react-native';
import Config from 'react-native-config';
import { getLocales } from 'react-native-localize';

/**
 * Platform-specific User Agent identifier prefix
 * - iOS: DOU_IOS
 * - Android: DOU_ANDROID
 */
export const APP_USER_AGENT_PREFIX = Platform.select({
    ios: USER_AGENT_PREFIX_IOS,
    android: USER_AGENT_PREFIX_ANDROID,
});

/**
 * Fetches the UserAgent
 * - Builds it by appending the app-specific `UserAgent` to the system `UserAgent`
 * - Whether `APP_USER_AGENT_PREFIX` is present can be used to determine the platform environment
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
 * Fetches the app language
 * - Fetches the language configured on the device
 * - Defaults to 'en'
 */
export const getAppLanguage = (): string => {
    const locales = getLocales();
    if (locales.length === 0) {
        return 'en';
    }
    return locales[0].languageCode;
};

import { USER_AGENT_PREFIX_ANDROID, USER_AGENT_PREFIX_IOS } from '@chatic/bridge-messages';

import DeviceInfo from 'react-native-device-info';
import { Platform } from 'react-native';
import Config from 'react-native-config';
import { getLocales } from 'react-native-localize';

export const APP_USER_AGENT_PREFIX = Platform.select({
    ios: USER_AGENT_PREFIX_IOS,
    android: USER_AGENT_PREFIX_ANDROID,
});

export const getUserAgent = async (): Promise<string> => {
    const systemUserAgent = await DeviceInfo.getUserAgent();
    const appName = Config.VIEW_APP_NAME ?? '';

    const appVersion = DeviceInfo.getVersion();
    const buildNumber = DeviceInfo.getBuildNumber();
    const platform = Platform.OS === 'ios' ? 'iOS' : 'Android';

    return `${systemUserAgent} (${APP_USER_AGENT_PREFIX}; ${appName}/${appVersion}; ${platform}; Build:${buildNumber})`;
};

export const getAppLanguage = (): string => {
    const locales = getLocales();
    if (locales.length === 0) {
        return 'en';
    }
    return locales[0].languageCode;
};

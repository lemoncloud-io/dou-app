import { isEncodedInviteUrl } from '@chatic/shared';

import { isNewPattern } from '../hooks/useWebRedirect';

import type { DeviceType } from '../../../hooks';

export const APP_MISSING_HASH = '#app-missing';

const IN_APP_BROWSER_PATTERN = /KAKAOTALK|NAVER\(inapp|\bLine\/|Instagram|FBAN|FBAV|DaumApps/i;

export const isInAppBrowser = (userAgent: string): boolean => IN_APP_BROWSER_PATTERN.test(userAgent);

export const isInviteLink = (url: string): boolean => isEncodedInviteUrl(url) || isNewPattern(url);

export const shouldAutoLaunch = (deviceType: DeviceType, userAgent: string): boolean => {
    if (deviceType === 'android') return true;
    if (deviceType === 'ios') return isInAppBrowser(userAgent);
    return false;
};

interface AppLaunchConfig {
    scheme: string;
    packageId: string;
}

export const buildAppLaunchUrl = (
    deviceType: DeviceType,
    fullPath: string,
    config: AppLaunchConfig,
    fallbackUrl: string
): string | null => {
    const pathWithoutLeadingSlash = fullPath.replace(/^\//, '');

    if (deviceType === 'ios') {
        return `${config.scheme}://${pathWithoutLeadingSlash}`;
    }
    if (deviceType === 'android') {
        return (
            `intent://${pathWithoutLeadingSlash}` +
            `#Intent;scheme=${config.scheme}` +
            `;package=${config.packageId}` +
            `;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)}` +
            `;end`
        );
    }
    return null;
};

export const openUrl = (url: string): void => {
    window.location.href = url;
};

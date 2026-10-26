import { isEncodedInviteUrl } from '@chatic/shared';

import { isNewPattern } from '../hooks/useWebRedirect';

import type { DeviceType } from '../../../hooks';

/**
 * Added to the page's own URL as the Android intent fallback when the launch was automatic. The
 * fallback reloads this page when the app is not installed, and the marker stops it from trying the
 * same launch again in a loop. A fragment, so it never reaches the link's query that the app and the
 * web redirect parse.
 */
export const APP_MISSING_HASH = '#app-missing';

/**
 * In-app browsers that load a tapped link themselves instead of handing it to the OS, so a Universal
 * Link never fires and this page is all the user sees. Matched against the user agent each one adds
 * to the system WebView's.
 */
const IN_APP_BROWSER_PATTERN = /KAKAOTALK|NAVER\(inapp|\bLine\/|Instagram|FBAN|FBAV|DaumApps/i;

export const isInAppBrowser = (userAgent: string): boolean => IN_APP_BROWSER_PATTERN.test(userAgent);

/**
 * Is this a link the app can do something with? Only these are tried automatically: a retired
 * `/s/<code>` short link would open the app straight onto its "invalid link" screen.
 */
export const isInviteLink = (url: string): boolean => isEncodedInviteUrl(url) || isNewPattern(url);

/**
 * Should the page try the app as soon as it loads, without waiting for a tap?
 *
 * - Android: always. An `intent://` URL opens the app when it is installed and follows its fallback
 *   when it is not, so trying costs a user without the app nothing.
 * - iOS: only inside an in-app browser. Safari and Chrome answer a custom scheme the device cannot
 *   open with an "invalid address" alert, which an invitee without the app would get on every visit;
 *   inside an in-app browser the button is otherwise the only way out, so the trade is worth it there.
 * - Desktop: never — there is no app to open.
 */
export const shouldAutoLaunch = (deviceType: DeviceType, userAgent: string): boolean => {
    if (deviceType === 'android') return true;
    if (deviceType === 'ios') return isInAppBrowser(userAgent);
    return false;
};

interface AppLaunchConfig {
    scheme: string;
    packageId: string;
}

/**
 * The URL that opens this link in the installed app: the custom scheme on iOS, an `intent://` URL
 * on Android so the browser can fall back to `fallbackUrl` when the package is missing.
 *
 * @returns null on desktop, where there is no app to open
 */
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

/** Navigates the page. Its own function so tests can observe the launch without a real navigation. */
export const openUrl = (url: string): void => {
    window.location.href = url;
};

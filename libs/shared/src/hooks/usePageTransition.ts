import {
    useNavigateWithTransition as useNavigateWithTransitionOriginal,
    useGoBack as useGoBackOriginal,
} from '@lemoncloud/react-page-transition';

import { getMobileAppInfo } from '@chatic/app-messages';

import type { PageTransitionConfig, PlatformType } from '@lemoncloud/react-page-transition';

/** Platform detection using @chatic/app-messages for native app bridge. */
const detectPlatform = (): PlatformType | undefined => {
    const { isAndroid, isOnMobileApp } = getMobileAppInfo();
    if (!isOnMobileApp) return undefined;
    return isAndroid ? 'android' : 'ios';
};

const pageTransitionConfig: PageTransitionConfig = { detectPlatform };

/** Wrapper with @chatic/app-messages platform detection. See @lemoncloud/react-page-transition for API docs. */
export const useNavigateWithTransition = () => useNavigateWithTransitionOriginal(pageTransitionConfig);

/** Wrapper with @chatic/app-messages platform detection. See @lemoncloud/react-page-transition for API docs. */
export const useGoBack = () => useGoBackOriginal(pageTransitionConfig);

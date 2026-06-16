import { useMemo } from 'react';
import type { PageTransitionConfig, PlatformType } from '@lemoncloud/react-page-transition';
import {
    useGoBack as useGoBackOriginal,
    useNavigateWithTransition as useNavigateWithTransitionOriginal,
} from '@lemoncloud/react-page-transition';

import { useDeviceInfo } from '@chatic/device-utils';

const getPageTransitionPlatform = (platform: string | undefined): PlatformType | undefined => {
    switch (platform) {
        case 'android':
            return 'android';
        case 'ios':
            return 'ios';
        default:
            return undefined;
    }
};

/** Platform detection using @chatic/app-messages for native app bridge. */
const usePageTransitionConfig = (): PageTransitionConfig => {
    const { deviceInfo } = useDeviceInfo();
    const pageTransitionPlatform = getPageTransitionPlatform(deviceInfo?.platform);

    return useMemo(
        () => ({
            platform: pageTransitionPlatform ?? 'auto',
        }),
        [pageTransitionPlatform]
    );
};

/** Wrapper with @chatic/app-messages platform detection. See @lemoncloud/react-page-transition for API docs. */
export const useNavigateWithTransition = () => {
    const config = usePageTransitionConfig();
    return useNavigateWithTransitionOriginal(config);
};

/** Wrapper with @chatic/app-messages platform detection. See @lemoncloud/react-page-transition for API docs. */
export const useGoBack = () => {
    const config = usePageTransitionConfig();
    return useGoBackOriginal(config);
};

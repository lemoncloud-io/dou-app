import type { PageTransitionConfig, PlatformType } from '@lemoncloud/react-page-transition';
import {
    useGoBack as useGoBackOriginal,
    useNavigateWithTransition as useNavigateWithTransitionOriginal,
} from '@lemoncloud/react-page-transition';

import { useDeviceInfo } from '@chatic/device-utils';

/** Platform detection using @chatic/app-messages for native app bridge. */
const detectPlatform = (): PlatformType | undefined => {
    const { deviceInfo } = useDeviceInfo();
    switch (deviceInfo?.platform) {
        case 'android':
            return 'android';
        case 'ios':
            return 'ios';
        default:
            return undefined;
    }
};

const pageTransitionConfig: PageTransitionConfig = { detectPlatform };

/** Wrapper with @chatic/app-messages platform detection. See @lemoncloud/react-page-transition for API docs. */
export const useNavigateWithTransition = () => useNavigateWithTransitionOriginal(pageTransitionConfig);

/** Wrapper with @chatic/app-messages platform detection. See @lemoncloud/react-page-transition for API docs. */
export const useGoBack = () => useGoBackOriginal(pageTransitionConfig);

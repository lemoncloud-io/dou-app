import { useMemo } from 'react';

import { useDeviceInfo } from './useDeviceInfo';

export const useAppChecker = () => {
    const { deviceInfo } = useDeviceInfo();

    const appLang = deviceInfo?.lang || 'ko';

    const isOnMobileApp = useMemo(() => deviceInfo?.application?.toLowerCase() === 'chatic', [deviceInfo]);
    const isIOS = useMemo(() => deviceInfo?.platform === 'ios', [deviceInfo]);
    const isAOS = useMemo(() => deviceInfo?.platform === 'aos', [deviceInfo]);

    return {
        appLang,
        isOnMobileApp,
        isIOS,
        isAOS,
    };
};

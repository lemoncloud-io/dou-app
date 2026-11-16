import { useEffect } from 'react';

import { useDeviceInfoStore } from '../stores/useDeviceInfoStore';

/**
 * The device and version facts for a screen. The store syncs from the host profile on mount; the
 * version half also moves when the shell announces a newer version (`updateVersionInfo`), which is
 * why this lives in a store rather than in the frozen profile.
 */
export const useDeviceInfo = () => {
    const { deviceInfo, versionInfo, syncDeviceAndVersionInfo } = useDeviceInfoStore();

    useEffect(() => {
        syncDeviceAndVersionInfo();
    }, [syncDeviceAndVersionInfo]);

    return {
        deviceInfo,
        versionInfo,
        syncDeviceAndVersionInfo,
    };
};

import { useEffect } from 'react';

import { useDeviceInfoStore } from '../stores';

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

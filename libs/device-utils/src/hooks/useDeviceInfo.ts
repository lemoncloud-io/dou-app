import { useEffect } from 'react';

import { useHandleAppMessage } from '@chatic/app-messages';

import { useDeviceInfoStore } from '../stores';

export const useDeviceInfo = () => {
    const { deviceInfo, versionInfo, syncDeviceAndVersionInfo } = useDeviceInfoStore();

    useEffect(() => {
        syncDeviceAndVersionInfo();
    }, [syncDeviceAndVersionInfo]);

    useHandleAppMessage('OnUpdateDeviceInfo', message => {
        useDeviceInfoStore.getState().updateVersionInfo(message.data.latestVersion, message.data.shouldUpdate);
    });

    return {
        deviceInfo,
        versionInfo,
        syncDeviceAndVersionInfo,
    };
};

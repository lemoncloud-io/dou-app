import { useEffect } from 'react';

import type { OnUpdateDeviceInfo } from '@chatic/app-messages';
import { useAppMessageStore } from '@chatic/app-messages';

import { useDeviceInfoStore } from '../stores';

export const useDeviceInfo = () => {
    const { deviceInfo, versionInfo, syncDeviceAndVersionInfo } = useDeviceInfoStore();

    useEffect(() => {
        syncDeviceAndVersionInfo();
    }, [syncDeviceAndVersionInfo]);

    useEffect(() => {
        const handler = (message: OnUpdateDeviceInfo) => {
            useDeviceInfoStore.getState().updateVersionInfo(message.data.latestVersion, message.data.shouldUpdate);
        };

        const store = useAppMessageStore.getState();
        store.addHandler('OnUpdateDeviceInfo', handler);
        return () => store.removeHandler('OnUpdateDeviceInfo', handler);
    }, []);

    return {
        deviceInfo,
        versionInfo,
        syncDeviceAndVersionInfo,
    };
};

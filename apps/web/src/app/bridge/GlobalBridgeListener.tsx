import { useEffect } from 'react';

import { logger } from '@chatic/bridges';

import { useDeviceInfoStore } from '../stores/useDeviceInfoStore';
import { appBridge } from './appBridge';
import { useShellDownloadCatchUp } from './shellDownload';
import { useAppForeground } from './useAppForeground';
import { useDeviceTokenRegistration } from './useDeviceTokenRegistration';
import { useOnUpdateDeviceInfo } from './useHandleAppMessage';

export const GlobalBridgeListener = (): null => {
    useDeviceTokenRegistration();

    useShellDownloadCatchUp();

    useEffect(() => useDeviceInfoStore.getState().syncDeviceAndVersionInfo(), []);

    useOnUpdateDeviceInfo(message => {
        useDeviceInfoStore.getState().updateVersionInfo(message.data.latestVersion, message.data.shouldUpdate);
    });

    useAppForeground(() => {
        logger.debug('ROUTER', 'App returned to foreground, triggering dismiss signal');
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                appBridge.dismissResumeOverlay();
            });
        });
    });

    return null;
};

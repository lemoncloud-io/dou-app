import { useEffect } from 'react';

import { useDeviceInfoStore } from '@chatic/device-utils';

import { appBridge, useOnUpdateDeviceInfo } from '../bridge';

/**
 * Owns the one-shot native handshake side effects that used to live inline in `App`:
 * - notify the native shell that the web app has mounted (dismisses the native loader),
 * - subscribe to native device-info/version updates and mirror them into the store.
 *
 * Renders nothing; mounted once under the runtime tree.
 */
export const NativeHandshake = (): null => {
    // Release the native APP LOADER as soon as the web app mounts.
    useEffect(() => {
        appBridge.notifyWebAppReady();
    }, []);

    // Mirror native version-info updates into the device-info store.
    useOnUpdateDeviceInfo(message => {
        useDeviceInfoStore.getState().updateVersionInfo(message.data.latestVersion, message.data.shouldUpdate);
    });

    return null;
};

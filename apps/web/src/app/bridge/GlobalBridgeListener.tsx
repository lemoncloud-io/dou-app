import { useEffect } from 'react';

import { logger } from '@chatic/bridges';

import { useDeviceInfoStore } from '../stores/useDeviceInfoStore';
import { appBridge } from './appBridge';
import { useShellDownloadCatchUp } from './shellDownload';
import { useAppForeground } from './useAppForeground';
import { useDeviceTokenRegistration } from './useDeviceTokenRegistration';
import { useOnUpdateDeviceInfo } from './useHandleAppMessage';

export const GlobalBridgeListener = (): null => {
    // Register the native push token once authenticated (no-op on web).
    useDeviceTokenRegistration();

    // Downloads the shell finished while the page was away, for the viewer's save and share.
    useShellDownloadCatchUp();

    // Fills the device and version store once, at the root. `updateVersionInfo` ignores a store that was
    // never filled, so a version announcement arriving before any screen read the store would be lost.
    // `@chatic/shared`'s page transition used to fill it as a side effect of every navigation hook; it
    // now reads the platform from the host profile and no longer touches this store.
    useEffect(() => useDeviceInfoStore.getState().syncDeviceAndVersionInfo(), []);

    useOnUpdateDeviceInfo(message => {
        useDeviceInfoStore.getState().updateVersionInfo(message.data.latestVersion, message.data.shouldUpdate);
    });

    // Foreground detection (native message + web visibilitychange) is owned by
    // useAppForeground; this listener only keeps the resume-overlay dismiss reaction.
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

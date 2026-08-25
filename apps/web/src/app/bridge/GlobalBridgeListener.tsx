import { logger } from '@chatic/bridges';
import { useDeviceInfoStore } from '@chatic/device-utils';
import { appBridge } from './appBridge';
import { useAppForeground } from './useAppForeground';
import { useDeviceTokenRegistration } from './useDeviceTokenRegistration';
import { useOnUpdateDeviceInfo } from './useHandleAppMessage';

export const GlobalBridgeListener = (): null => {
    // Register the native push token once authenticated (no-op on web).
    useDeviceTokenRegistration();

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

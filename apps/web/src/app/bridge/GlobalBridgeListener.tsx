import { useEffect } from 'react';

import { logger } from '@chatic/bridges';
import { useDeviceInfoStore } from '@chatic/device-utils';
import { appBridge } from './appBridge';
import { useDeviceTokenRegistration } from './useDeviceTokenRegistration';
import { useOnBackgroundStatusChanged, useOnUpdateDeviceInfo } from './useHandleAppMessage';

export const GlobalBridgeListener = (): null => {
    // Register the native push token once authenticated (no-op on web).
    useDeviceTokenRegistration();

    useOnUpdateDeviceInfo(message => {
        useDeviceInfoStore.getState().updateVersionInfo(message.data.latestVersion, message.data.shouldUpdate);
    });

    const sendDismissSignal = () => {
        logger.info('ROUTER', 'Sending DismissResumeOverlay signal');
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                appBridge.dismissResumeOverlay();
            });
        });
    };

    useOnBackgroundStatusChanged(message => {
        const { isForeground } = message.data;
        if (isForeground) {
            logger.info('ROUTER', 'Web app received OnBackgroundStatusChanged(foreground), triggering dismiss signal');
            sendDismissSignal();
        }
    });

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                logger.info('ROUTER', 'Web app became visible (visibilitychange), triggering dismiss signal');
                sendDismissSignal();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    return null;
};

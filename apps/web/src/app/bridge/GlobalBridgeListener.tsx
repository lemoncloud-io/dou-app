import { useEffect } from 'react';
import type { JSX } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { useDeviceInfoStore } from '@chatic/device-utils';
import { appBridge } from './appBridge';
import { useOnBackgroundStatusChanged, useOnNavigate, useOnUpdateDeviceInfo } from './useHandleAppMessage';

export const GlobalBridgeListener = (): JSX.Element => {
    const navigate = useNavigate();

    // Mirror device-info/version push events into the store; these arrive whenever
    // native updates its state (app foreground, version change, etc.)
    useOnUpdateDeviceInfo(message => {
        useDeviceInfoStore.getState().updateVersionInfo(message.data.latestVersion, message.data.shouldUpdate);
    });

    useOnNavigate(message => {
        const { path, replace } = message.data;
        logger.info('ROUTER', `Received OnNavigate event from native: ${path}`, { replace });
        try {
            navigate(path, { replace: !!replace });
        } catch (error) {
            logger.error('ROUTER', `Failed to navigate to: ${path}`, { error });
        }
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

    return <Outlet />;
};

import { useEffect, useRef } from 'react';

import { logger, postMessage, useHandleAppMessage } from '@chatic/app-messages';
import { useWebCoreStore } from '@chatic/web-core';
import { useRegisterDeviceToken } from '@chatic/users';

import { useDynamicDeviceId } from './useDynamicDeviceId';

declare global {
    interface Window {
        CHATIC_APP_PLATFORM?: string;
        CHATIC_APP_APPLICATION?: string;
    }
}

const DEVICE_TOKEN_STORAGE_KEY = 'chatic-device-token';

export const useDeviceTokenRegistration = () => {
    const { isAuthenticated } = useWebCoreStore();
    const { deviceId } = useDynamicDeviceId();
    const { mutateAsync: registerDeviceToken } = useRegisterDeviceToken();
    const hasRegistered = useRef(false);
    const isHandlerReady = useRef(false);

    useEffect(() => {
        if (!isAuthenticated) return;
        if (!window.CHATIC_APP_PLATFORM) return;
        if (hasRegistered.current) return;

        isHandlerReady.current = true;
        logger.info('DEVICE_TOKEN', '[DeviceToken] isAppEnv detected, requesting FetchFcmToken');
        postMessage({ type: 'FetchFcmToken' });
    }, [isAuthenticated]);

    useHandleAppMessage('OnFetchFcmToken', async message => {
        logger.info('DEVICE_TOKEN', '[DeviceToken] OnFetchFcmToken received', { hasToken: !!message.data.token });
        if (!isAuthenticated) {
            logger.info('DEVICE_TOKEN', '[DeviceToken] not authenticated, skip');
            return;
        }
        const newToken = message.data.token;
        if (!newToken) return;

        const storedToken = localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY);
        logger.debug('DEVICE_TOKEN', '[DeviceToken] received token', {
            hasNewToken: !!newToken,
            hasStoredToken: !!storedToken,
            isChanged: storedToken !== newToken,
        });

        if (storedToken === newToken) {
            logger.info('DEVICE_TOKEN', '[DeviceToken] token unchanged, skip register');
            return;
        }

        try {
            await registerDeviceToken({
                deviceId,
                deviceToken: newToken,
                platform: window.CHATIC_APP_PLATFORM,
                installId: window.CHATIC_APP_INSTALLATION_ID,
                application: 'chatic',
            });
            localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, newToken);
            hasRegistered.current = true;
            logger.info('DEVICE_TOKEN', '[DeviceToken] register success');
        } catch (error) {
            logger.error('DEVICE_TOKEN', '[DeviceToken] register failed', { error });
        }
    });
};

export const DeviceTokenRegistration = () => {
    useDeviceTokenRegistration();
    return null;
};

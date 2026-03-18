import { useEffect, useRef } from 'react';

import { postMessage, useHandleAppMessage } from '@chatic/app-messages';
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
        console.log('[DeviceToken] isAppEnv detected, requesting FetchFcmToken...');
        postMessage({ type: 'FetchFcmToken' });
    }, [isAuthenticated]);

    useHandleAppMessage('OnFetchFcmToken', async message => {
        console.log('[DeviceToken] OnFetchFcmToken received:', message.data);
        if (!isAuthenticated) {
            console.log('[DeviceToken] not authenticated, skip');
            return;
        }
        const newToken = message.data.token;
        if (!newToken) return;

        const storedToken = localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY);
        console.log('[DeviceToken] received token:', newToken, '/ stored:', storedToken);

        if (storedToken === newToken) {
            console.log('[DeviceToken] token unchanged, skip register');
            return;
        }

        try {
            await registerDeviceToken({
                deviceId,
                deviceToken: newToken,
                platform: window.CHATIC_APP_PLATFORM,
                application: window.CHATIC_APP_APPLICATION,
            });
            localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, newToken);
            hasRegistered.current = true;
            console.log('[DeviceToken] register success');
        } catch (error) {
            console.error('[DeviceToken] register failed:', error);
        }
    });
};

export const DeviceTokenRegistration = () => {
    useDeviceTokenRegistration();
    return null;
};

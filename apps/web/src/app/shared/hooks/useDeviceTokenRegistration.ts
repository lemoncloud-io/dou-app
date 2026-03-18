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
        postMessage({ type: 'FetchFcmToken' });
    }, [isAuthenticated]);

    useHandleAppMessage('OnFetchFcmToken', async message => {
        if (!isAuthenticated) return;
        const newToken = message.data.token;
        if (!newToken) return;

        const storedToken = localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY);
        if (storedToken === newToken) return;

        try {
            await registerDeviceToken({
                deviceId,
                deviceToken: newToken,
                platform: window.CHATIC_APP_PLATFORM,
                application: window.CHATIC_APP_APPLICATION,
            });
            localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, newToken);
            hasRegistered.current = true;
        } catch (error) {
            console.error('[DeviceToken] register failed:', error);
        }
    });
};

export const DeviceTokenRegistration = () => {
    useDeviceTokenRegistration();
    return null;
};

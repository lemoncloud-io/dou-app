import { useEffect, useRef } from 'react';

import { appBridge } from '../bridge';
import { useWebCoreStore } from 'libs/web-core/src';
import { useRegisterDeviceToken } from 'libs/web-core/src';
import { useDynamicDeviceId } from 'libs/web-core/src';

// TODO: @chatic/bridges에서 임포트할 logger 변수 임시 사용 또는 console 대체
const appLogger = {
    info: (tag: string, msg: string, ...args: any[]) => console.log(`[${tag}] ${msg}`, ...args),
    debug: (tag: string, msg: string, ...args: any[]) => console.debug(`[${tag}] ${msg}`, ...args),
    error: (tag: string, msg: string, ...args: any[]) => console.error(`[${tag}] ${msg}`, ...args),
};

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

    useEffect(() => {
        if (!isAuthenticated) return;
        if (!window.CHATIC_APP_PLATFORM) return;
        if (hasRegistered.current) return;

        appLogger.info('DEVICE_TOKEN', '[DeviceToken] isAppEnv detected, requesting FetchFcmToken');

        appBridge
            .fetchFcmToken()
            .then(async response => {
                const newToken = response.data.token;
                appLogger.info('DEVICE_TOKEN', '[DeviceToken] OnFetchFcmToken received', { hasToken: !!newToken });
                if (!newToken) return;

                const storedToken = localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY);
                appLogger.debug('DEVICE_TOKEN', '[DeviceToken] received token', {
                    hasNewToken: !!newToken,
                    hasStoredToken: !!storedToken,
                    isChanged: storedToken !== newToken,
                });

                if (storedToken === newToken) {
                    appLogger.info('DEVICE_TOKEN', '[DeviceToken] token unchanged, skip register');
                    return;
                }

                await registerDeviceToken({
                    deviceId,
                    deviceToken: newToken,
                    platform: window.CHATIC_APP_PLATFORM,
                    installId: window.CHATIC_APP_INSTALLATION_ID,
                    application: 'chatic',
                });
                localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, newToken);
                hasRegistered.current = true;
                appLogger.info('DEVICE_TOKEN', '[DeviceToken] register success');
            })
            .catch(error => {
                appLogger.error('DEVICE_TOKEN', '[DeviceToken] register failed', { error });
            });
    }, [isAuthenticated]);
};

export const DeviceTokenRegistration = () => {
    useDeviceTokenRegistration();
    return null;
};

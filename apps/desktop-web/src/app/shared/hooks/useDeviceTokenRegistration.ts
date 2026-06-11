import { useEffect, useRef } from 'react';

import { isNative, webClient } from '@chatic/bridges';
import { useWebCoreStore } from '@chatic/web-core';
import { useDynamicDeviceId } from '@chatic/app-runtime';
import { useRegisterDeviceToken } from '@chatic/users';

declare global {
    interface Window {
        CHATIC_APP_PLATFORM?: string;
        CHATIC_APP_INSTALLATION_ID?: string;
    }
}

const DEVICE_TOKEN_KEY = 'chatic-device-token';

/**
 * Desktop cross-cloud push registration. Inside the Electron shell, asks the main
 * process for its FCM token (FetchFcmToken → OnFetchFcmToken) and registers it
 * with the home broker (`reg-dev`, platform 'desktop'); the central pushes-api
 * then fans out pushes to this device for messages in ANY cloud — the path the
 * live WebSocket can't cover (it only sees the currently-connected cloud).
 *
 * No-op in a plain browser (isNative() false). Deduped via localStorage so it
 * registers once per token. Best-effort — failure leaves same-cloud WS
 * notifications working.
 */
export const useDeviceTokenRegistration = (): void => {
    const isAuthenticated = useWebCoreStore(s => s.isAuthenticated);
    const { deviceId } = useDynamicDeviceId();
    const { mutateAsync: registerDeviceToken } = useRegisterDeviceToken();
    const requestedRef = useRef(false);

    // Ask the shell for the FCM token once authenticated.
    useEffect(() => {
        if (!isAuthenticated || !isNative() || requestedRef.current) return;
        requestedRef.current = true;
        webClient.post('FetchFcmToken', {});
    }, [isAuthenticated]);

    // Register the returned token with the broker (deduped).
    useEffect(() => {
        if (!isNative()) return;
        return webClient.onEvent('OnFetchFcmToken', message => {
            const token = message.data?.token;
            if (!token || !isAuthenticated) return;
            if (localStorage.getItem(DEVICE_TOKEN_KEY) === token) return;
            void registerDeviceToken({
                deviceId,
                deviceToken: token,
                platform: window.CHATIC_APP_PLATFORM ?? 'desktop',
                installId: window.CHATIC_APP_INSTALLATION_ID,
                application: 'chatic',
            })
                .then(() => localStorage.setItem(DEVICE_TOKEN_KEY, token))
                .catch(() => undefined);
        });
    }, [isAuthenticated, deviceId, registerDeviceToken]);
};

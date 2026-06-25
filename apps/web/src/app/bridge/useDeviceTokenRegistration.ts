import { useEffect, useState } from 'react';

import type { RegisterDeviceTokenBody } from '@lemoncloud/chatic-backend-api';
import { useRegisterDeviceToken, useSessionAuth } from '@chatic/web-core';

import { appBridge } from './appBridge';

// web-core's useRegisterDeviceToken injects `deviceId` internally, so the app only
// supplies the rest of the payload.
type DeviceTokenBody = Omit<RegisterDeviceTokenBody, 'deviceId'>;

const APPLICATION = 'chatic';

/**
 * Bridge-side push device-token registration.
 *
 * Only the native app shell can resolve an FCM token, so this fetches it via
 * `appBridge.fetchFcmToken()` once the session is authenticated, then hands the
 * payload to web-core's `useRegisterDeviceToken`. web-core performs the actual
 * registration and de-dupes by the token stored in identityCore, so re-renders
 * and unchanged tokens are no-ops (no manual localStorage bookkeeping needed).
 */
export const useDeviceTokenRegistration = (): void => {
    const { isAuthenticated } = useSessionAuth();
    const [body, setBody] = useState<DeviceTokenBody | null>(null);

    useEffect(() => {
        const platform = typeof window !== 'undefined' ? window.CHATIC_APP_PLATFORM : undefined;
        // Skip outside the native shell or before authentication.
        if (!isAuthenticated || !platform) return;

        let cancelled = false;
        appBridge
            .fetchFcmToken()
            .then(response => {
                const deviceToken = response.data.token;
                if (cancelled || !deviceToken) return;
                setBody({
                    deviceToken,
                    platform,
                    installId: window.CHATIC_APP_INSTALLATION_ID,
                    application: APPLICATION,
                });
            })
            .catch(() => {
                // Token fetch can fail (e.g. permission denied); nothing to register.
            });

        return () => {
            cancelled = true;
        };
    }, [isAuthenticated]);

    useRegisterDeviceToken(body);
};

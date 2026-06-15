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

/**
 * Desktop cross-cloud push registration. Inside the Electron shell, asks the main
 * process for its FCM token (FetchFcmToken → OnFetchFcmToken) and registers it
 * with the home broker (`reg-dev`, platform 'desktop'); the central pushes-api
 * then fans pushes out to this device for messages in ANY cloud — the path the
 * live WebSocket can't cover (it only sees the currently-connected cloud).
 *
 * Registers once per app launch, deliberately NOT deduped by token. SNS disables
 * a platform endpoint after a single failed delivery — and the desktop's
 * push-receiver token can be rejected (NotRegistered) — while CreatePlatformEndpoint
 * does not revive a disabled endpoint. A token-equality skip (the old behaviour,
 * still used by mobile) therefore leaves the device permanently dark once the
 * endpoint goes down. Re-registering every launch lets the broker refresh and
 * re-enable the endpoint. (The broker's reg-dev must SetEndpointAttributes
 * Enabled=true on an existing endpoint for this to take full effect.)
 *
 * No-op in a plain browser (isNative() false). Best-effort — a failure leaves
 * same-cloud WS notifications working and is retried on the next token event.
 */
export const useDeviceTokenRegistration = (): void => {
    const isAuthenticated = useWebCoreStore(s => s.isAuthenticated);
    const { deviceId } = useDynamicDeviceId();
    const { mutateAsync: registerDeviceToken } = useRegisterDeviceToken();
    const requestedRef = useRef(false);
    const registeredRef = useRef(false);

    // Ask the shell for the FCM token once authenticated.
    useEffect(() => {
        if (!isAuthenticated || !isNative() || requestedRef.current) return;
        requestedRef.current = true;
        webClient.post('FetchFcmToken', {});
    }, [isAuthenticated]);

    // Register the returned token with the broker — once per launch, no token
    // dedup, so a disabled endpoint gets re-enabled on the next restart.
    useEffect(() => {
        if (!isNative()) return;
        return webClient.onEvent('OnFetchFcmToken', message => {
            const token = message.data?.token;
            if (!token || !isAuthenticated || registeredRef.current) return;
            registeredRef.current = true;
            void registerDeviceToken({
                deviceId,
                deviceToken: token,
                platform: window.CHATIC_APP_PLATFORM ?? 'desktop',
                installId: window.CHATIC_APP_INSTALLATION_ID,
                application: 'chatic',
                // Force the broker to (re)create + re-enable the SNS endpoint each
                // launch rather than returning its cached (possibly deleted/disabled)
                // record — the desktop endpoint is otherwise left permanently dark.
                force: true,
            }).catch(() => {
                registeredRef.current = false; // allow a retry on the next token event
            });
        });
    }, [isAuthenticated, deviceId, registerDeviceToken]);
};

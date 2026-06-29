import { useCallback, useEffect, useRef } from 'react';

import { isNative, webClient } from '@chatic/bridges';
import { useDynamicDeviceId, useSessionAuth } from '@chatic/web-core';
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
 * Registers on launch AND whenever the user returns to the app (throttled),
 * deliberately NOT deduped by token. SNS disables a platform endpoint after a
 * single failed delivery — and the desktop's push-receiver token can be rejected
 * (NotRegistered) — while CreatePlatformEndpoint does not revive a disabled
 * endpoint. A token-equality skip (the old behaviour, still used by mobile)
 * therefore leaves the device permanently dark once the endpoint goes down, with
 * no recovery until a full restart. Re-registering (force) on focus lets the
 * broker re-enable the endpoint mid-session. (The broker's reg-dev must
 * SetEndpointAttributes Enabled=true on an existing endpoint for this to take
 * full effect.)
 *
 * No-op in a plain browser (isNative() false). Best-effort — a failure leaves
 * same-cloud WS notifications working and is retried on the next token event.
 */
const REREGISTER_THROTTLE_MS = 60_000;

export const useDeviceTokenRegistration = (): void => {
    const { isAuthenticated } = useSessionAuth();
    const { deviceId } = useDynamicDeviceId();
    const { mutateAsync: registerDeviceToken } = useRegisterDeviceToken();
    const requestedRef = useRef(false);
    const tokenRef = useRef<string | null>(null);
    const lastRegisterAtRef = useRef(0);

    // Force the broker to (re)create + re-enable the SNS endpoint, throttled so
    // repeated focus events don't hammer reg-dev.
    const register = useCallback(() => {
        const token = tokenRef.current;
        if (!token || !isAuthenticated) return;
        const now = Date.now();
        if (now - lastRegisterAtRef.current < REREGISTER_THROTTLE_MS) return;
        lastRegisterAtRef.current = now;
        void registerDeviceToken({
            deviceId,
            deviceToken: token,
            platform: window.CHATIC_APP_PLATFORM ?? 'desktop',
            installId: window.CHATIC_APP_INSTALLATION_ID,
            application: 'chatic',
            force: true,
        }).catch(() => {
            lastRegisterAtRef.current = 0; // allow an immediate retry
        });
    }, [isAuthenticated, deviceId, registerDeviceToken]);

    // Ask the shell for the FCM token once authenticated.
    useEffect(() => {
        if (!isAuthenticated || !isNative() || requestedRef.current) return;
        requestedRef.current = true;
        webClient.post('FetchFcmToken', {});
    }, [isAuthenticated]);

    // Cache the returned token and register it (launch path).
    useEffect(() => {
        if (!isNative()) return;
        return webClient.onEvent('OnFetchFcmToken', message => {
            const token = message.data?.token;
            if (!token) return;
            tokenRef.current = token;
            register();
        });
    }, [register]);

    // Re-register (throttled) whenever the user returns to the app so an endpoint
    // disabled mid-session comes back without a restart.
    useEffect(() => {
        if (!isNative()) return;
        const onFocus = () => {
            if (document.visibilityState === 'visible') register();
        };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onFocus);
        };
    }, [register]);
};

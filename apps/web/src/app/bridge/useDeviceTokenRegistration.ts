import { useMemo } from 'react';

import type { DeviceTokenDelegate } from '@chatic/app-runtime';
import { useDeviceTokenRegistration as useRuntimeDeviceTokenRegistration } from '@chatic/app-runtime';

import { appBridge } from './appBridge';

const APPLICATION = 'chatic';

/**
 * Bridge-side adapter for app-runtime's push registration.
 *
 * Only the native app shell can resolve an FCM token, so this wires
 * `appBridge.fetchFcmToken()` into the runtime's DeviceTokenDelegate. All
 * registration policy (auth gating, force re-register, throttle, retry) lives
 * in app-runtime — this file only supplies the shell-specific pieces: the
 * token fetch and the window-injected platform/install identifiers.
 *
 * Outside the native shell (no CHATIC_APP_PLATFORM) the delegate is null and
 * the runtime hook is a no-op.
 */
export const useDeviceTokenRegistration = (): void => {
    // Shell globals are injected before the web app boots, so resolving once is safe.
    const delegate = useMemo<DeviceTokenDelegate | null>(() => {
        const platform = typeof window !== 'undefined' ? window.CHATIC_APP_PLATFORM : undefined;
        if (!platform) return null;
        return {
            fetchDeviceToken: () =>
                appBridge
                    .fetchFcmToken()
                    .then(response => response.data?.token ?? null)
                    // Token fetch can fail (e.g. permission denied); the runtime retries later.
                    .catch(() => null),
            platform,
            installId: window.CHATIC_APP_INSTALLATION_ID,
            application: APPLICATION,
        };
    }, []);

    useRuntimeDeviceTokenRegistration(delegate);
};

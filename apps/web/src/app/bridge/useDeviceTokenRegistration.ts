import { useMemo } from 'react';

import { runtime } from '@chatic/app-runtime';

import { appBridge } from './appBridge';

const APPLICATION = 'chatic';
const RECORD_PREFERENCE_KEY = 'pushRegistration' as const;

/**
 * Native mirror of app-runtime's registration record (ADR-0077).
 *
 * The record decides whether `reg-dev` is called at all, so it must outlive the webview's own
 * storage — a cache clear would otherwise read as "never registered" and re-register every device it
 * touched. Native `pushRegistration` is that durable copy.
 *
 * Both halves are best-effort. `SavePreference` is refused by an app build whose bridge allowlist
 * predates this key (`PREF_KEY_NOT_WRITABLE`), and the web bundle ships ahead of the app, so that is
 * the normal state right after release — the runtime keeps its web-storage copy and behaves exactly
 * as it did before the mirror existed. Reads are not allowlisted, so they simply come back empty.
 */
const nativeRecordMirror: runtime.push.DeviceTokenDelegate['nativeRecordMirror'] = {
    read: () =>
        appBridge
            .fetchPreference({ key: RECORD_PREFERENCE_KEY })
            .then(response => {
                const value = response.data?.value;
                return typeof value === 'string' ? value : null;
            })
            .catch(() => null),
    write: raw => appBridge.savePreferenceConfirmed({ key: RECORD_PREFERENCE_KEY, value: raw }).then(() => undefined),
};

/**
 * Bridge-side adapter for app-runtime's push registration.
 *
 * Only the native app shell can resolve an FCM token, so this wires
 * `appBridge.fetchFcmToken()` into the runtime's runtime.push.DeviceTokenDelegate. All
 * registration policy (auth gating, once-per-install dedup, retry) lives in app-runtime — this file
 * only supplies the shell-specific pieces: the token fetch, the window-injected platform identifier,
 * and the native mirror for the registration record. Device identity (deviceId / firebase
 * installation id) is resolved inside the runtime via useDynamicDeviceId, the single source shared
 * with the socket side.
 *
 * `stage` is deliberately NOT sent: mobile builds carry their stage in the flavor's
 * google-services.json, and the app has always registered without it.
 *
 * Outside the native shell (no CHATIC_APP_PLATFORM) the delegate is null and
 * the runtime hook is a no-op.
 */
export const useDeviceTokenRegistration = (): void => {
    // Shell globals are injected before the web app boots, so resolving once is safe.
    const delegate = useMemo<runtime.push.DeviceTokenDelegate | null>(() => {
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
            application: APPLICATION,
            nativeRecordMirror,
        };
    }, []);

    runtime.push.useDeviceTokenRegistration(delegate);
};

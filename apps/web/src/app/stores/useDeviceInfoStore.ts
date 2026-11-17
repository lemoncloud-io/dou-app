import { create } from 'zustand';

import type { DeviceInfo, Env, PageLanguage, Platform, VersionInfo } from '@chatic/bridge-messages';
import { liveShellGlobals } from '@chatic/bridges';

declare const __APP_VERSION__: string;

/**
 * Every spelling a shell has ever injected, mapped onto `Env`.
 *
 * Three vocabularies reach this one global. Mobile injects `Env` today but older installs still
 * send `VITE_ENV` verbatim (`'LOCAL' | 'DEV' | 'PROD'`), and desktop sends `'dev' | 'prod'` —
 * `'dev'` is not an `Env` member but is what the push broker's SNS application is named after
 * (`chatic-desktop-dev`), so it is deliberately left alone on the
 * wire and translated here instead.
 *
 * The old-mobile rows are not optional. The web deploys before the app does, so there is always a
 * window where a new web reads an old shell's global; dropping those spellings would relabel every
 * installed app as `'local'` until it updates.
 */
const ENV_BY_INJECTED: Readonly<Record<string, Env>> = {
    local: 'local',
    stage: 'stage',
    prod: 'prod',
    // Desktop's wire value — kept as-is on the wire for the push broker.
    dev: 'stage',
    // Mobile <= the release that started injecting `Env`.
    LOCAL: 'local',
    DEV: 'stage',
    PROD: 'prod',
};

/**
 * Narrows the shell-injected stage string, rather than asserting it.
 *
 * `as Env` was hiding the mismatch above: it let `'DEV'` and `'dev'` through into `DeviceInfo.stage`
 * unchanged, so the two shells disagreed on what the same stage was called. An unrecognized value
 * falls back to `'local'`, the least privileged stage — the same default this read has always used
 * when the global is absent (plain web).
 */
const toEnv = (raw: string | undefined): Env => ENV_BY_INJECTED[raw ?? ''] ?? 'local';

export interface DeviceInfoStore {
    deviceInfo: DeviceInfo | null;
    versionInfo: VersionInfo | null;
    syncDeviceAndVersionInfo: () => void;
    updateVersionInfo: (latestVersion: string, shouldUpdate: boolean) => void;
}

export const useDeviceInfoStore = create<DeviceInfoStore>(set => ({
    deviceInfo: null,
    versionInfo: null,
    syncDeviceAndVersionInfo: () => {
        // Read live (`liveShellGlobals()`) on every sync, not from the host profile's boot snapshot: the
        // phone runs its boot script again after load, and that pass can rewrite the device ids and the
        // version check.
        // A later sync therefore also puts the injected `latestVersion`/`shouldUpdate` back over what
        // `updateVersionInfo` merged since — every mount of `useDeviceInfo` does that, as it always has.
        const g = liveShellGlobals();
        const platform = (g.CHATIC_APP_PLATFORM as Platform) || 'web';
        const application = g.CHATIC_APP_APPLICATION || '';
        const stage = toEnv(g.CHATIC_APP_STAGE);
        const deviceId = g.CHATIC_APP_DEVICE_ID;
        const deviceModel = g.CHATIC_APP_DEVICE_MODEL;
        const currentVersion = g.CHATIC_APP_CURRENT_VERSION || '';
        const latestVersion = g.CHATIC_APP_LATEST_VERSION || '';
        const shouldUpdate = g.CHATIC_APP_SHOULD_UPDATE === 'true';
        const appLang = g.CHATIC_APP_CURRENT_LANGUAGE as PageLanguage | undefined;
        const installId = g.CHATIC_APP_INSTALLATION_ID || '';
        // Mirror the new globals verbatim (undefined when absent so `??` fallbacks
        // work downstream). INSTALLATION_ID is deliberately not folded in: app
        // <= 0.15.x injected the Firebase installation id there, so it is not a
        // safe bare-device-id source.
        const uniqueDeviceId = g.CHATIC_APP_UNIQUE_DEVICE_ID || undefined;
        const firebaseInstallationId = g.CHATIC_APP_FIREBASE_INSTALLATION_ID || undefined;

        const webVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
        const appVersion = currentVersion || webVersion;

        const deviceInfo: DeviceInfo = {
            stage,
            application,
            deviceId,
            deviceModel,
            platform,
            installId,
            uniqueDeviceId,
            firebaseInstallationId,
            lang: appLang,
        };
        const versionInfo: VersionInfo = {
            currentVersion,
            latestVersion,
            shouldUpdate,
            appVersion,
            webVersion,
        };

        set({ deviceInfo, versionInfo });
    },
    updateVersionInfo: (latestVersion: string, shouldUpdate: boolean) => {
        set(state => {
            if (!state.versionInfo) return state;
            if (state.versionInfo.latestVersion === latestVersion && state.versionInfo.shouldUpdate === shouldUpdate) {
                return state;
            }
            return {
                versionInfo: { ...state.versionInfo, latestVersion, shouldUpdate },
            };
        });
    },
}));

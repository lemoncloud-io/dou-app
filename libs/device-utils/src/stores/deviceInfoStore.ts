import { create } from 'zustand';

import type { DeviceInfo, Env, PageLanguage, Platform, VersionInfo } from '@chatic/app-messages';

declare const __APP_VERSION__: string;

declare global {
    interface Window {
        CHATIC_APP_PLATFORM?: string;
        CHATIC_APP_APPLICATION?: string;
        CHATIC_APP_STAGE?: string;
        CHATIC_APP_DEVICE_TOKEN?: string;
        /** @deprecated Composite `deviceId:firebaseInstallId`; use CHATIC_APP_UNIQUE_DEVICE_ID + CHATIC_APP_FIREBASE_INSTALLATION_ID. */
        CHATIC_APP_DEVICE_ID?: string;
        CHATIC_APP_DEVICE_MODEL?: string;
        CHATIC_APP_CURRENT_VERSION?: string;
        CHATIC_APP_LATEST_VERSION?: string;
        CHATIC_APP_SHOULD_UPDATE?: string;
        CHATIC_APP_CURRENT_LANGUAGE?: string;
        /** @deprecated Carries the bare device id despite the name; use CHATIC_APP_UNIQUE_DEVICE_ID. */
        CHATIC_APP_INSTALLATION_ID?: string;
        CHATIC_APP_UNIQUE_DEVICE_ID?: string;
        CHATIC_APP_FIREBASE_INSTALLATION_ID?: string;
    }
}

/**
 * Every spelling a shell has ever injected, mapped onto `Env`.
 *
 * Three vocabularies reach this one global. Mobile injects `Env` today but older installs still
 * send `VITE_ENV` verbatim (`'LOCAL' | 'DEV' | 'PROD'`), and desktop sends `'dev' | 'prod'` —
 * `'dev'` is not an `Env` member but is what the push broker's SNS application is named after
 * (`chatic-desktop-dev`, docs/specs/cross-cloud-push.md), so it is deliberately left alone on the
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
        const platform = (window.CHATIC_APP_PLATFORM as Platform) || 'web';
        const application = window.CHATIC_APP_APPLICATION || '';
        const stage = toEnv(window.CHATIC_APP_STAGE);
        const deviceToken = window.CHATIC_APP_DEVICE_TOKEN;
        const deviceId = window.CHATIC_APP_DEVICE_ID;
        const deviceModel = window.CHATIC_APP_DEVICE_MODEL;
        const currentVersion = window.CHATIC_APP_CURRENT_VERSION || '';
        const latestVersion = window.CHATIC_APP_LATEST_VERSION || '';
        const shouldUpdate = window.CHATIC_APP_SHOULD_UPDATE === 'true';
        const appLang = window.CHATIC_APP_CURRENT_LANGUAGE as PageLanguage | undefined;
        const installId = window.CHATIC_APP_INSTALLATION_ID || '';
        // Mirror the new globals verbatim (undefined when absent so `??` fallbacks
        // work downstream). INSTALLATION_ID is deliberately not folded in: app
        // <= 0.15.x injected the Firebase installation id there, so it is not a
        // safe bare-device-id source.
        const uniqueDeviceId = window.CHATIC_APP_UNIQUE_DEVICE_ID || undefined;
        const firebaseInstallationId = window.CHATIC_APP_FIREBASE_INSTALLATION_ID || undefined;

        const webVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
        const appVersion = currentVersion || webVersion;

        const deviceInfo: DeviceInfo = {
            stage,
            application,
            deviceId,
            deviceModel,
            deviceToken,
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

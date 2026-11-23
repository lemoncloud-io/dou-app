import { create } from 'zustand';

import type { DeviceInfo, Env, PageLanguage, Platform, VersionInfo } from '@chatic/bridge-messages';
import { liveShellGlobals } from '@chatic/bridges';

declare const __APP_VERSION__: string;

const ENV_BY_INJECTED: Readonly<Record<string, Env>> = {
    local: 'local',
    stage: 'stage',
    prod: 'prod',
    dev: 'stage',
    LOCAL: 'local',
    DEV: 'stage',
    PROD: 'prod',
};

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

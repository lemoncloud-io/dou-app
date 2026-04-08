import { create } from 'zustand';

import type { DeviceInfo, Env, PageLanguage, Platform, VersionInfo } from '@chatic/app-messages';

declare const __APP_VERSION__: string;

declare global {
    interface Window {
        CHATIC_APP_PLATFORM?: string;
        CHATIC_APP_APPLICATION?: string;
        CHATIC_APP_STAGE?: string;
        CHATIC_APP_DEVICE_TOKEN?: string;
        CHATIC_APP_DEVICE_ID?: string;
        CHATIC_APP_DEVICE_MODEL?: string;
        CHATIC_APP_CURRENT_VERSION?: string;
        CHATIC_APP_LATEST_VERSION?: string;
        CHATIC_APP_SHOULD_UPDATE?: string;
        CHATIC_APP_CURRENT_LANGUAGE?: string;
        CHATIC_APP_INSTALL_ID?: string;
    }
}

export interface DeviceInfoStore {
    deviceInfo: DeviceInfo | null;
    versionInfo: VersionInfo | null;
    syncDeviceAndVersionInfo: () => void;
}

export const useDeviceInfoStore = create<DeviceInfoStore>(set => ({
    deviceInfo: null,
    versionInfo: null,
    syncDeviceAndVersionInfo: () => {
        const platform = (window.CHATIC_APP_PLATFORM as Platform) || 'web';
        const application = window.CHATIC_APP_APPLICATION || '';
        const stage = (window.CHATIC_APP_STAGE as Env) || 'local';
        const deviceToken = window.CHATIC_APP_DEVICE_TOKEN;
        const deviceId = window.CHATIC_APP_DEVICE_ID;
        const deviceModel = window.CHATIC_APP_DEVICE_MODEL;
        const currentVersion = window.CHATIC_APP_CURRENT_VERSION || '';
        const latestVersion = window.CHATIC_APP_LATEST_VERSION || '';
        const shouldUpdate = window.CHATIC_APP_SHOULD_UPDATE === 'true';
        const appLang = window.CHATIC_APP_CURRENT_LANGUAGE as PageLanguage | undefined;
        const installId = window.CHATIC_APP_INSTALL_ID || '';

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
}));

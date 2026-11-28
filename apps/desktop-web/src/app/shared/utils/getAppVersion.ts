import { getShellApp } from '@chatic/host-web-desktop-shell';

declare const __APP_VERSION__: string;

interface AppVersionInfo {
    desktopWebVersion: string;
    desktopVersion: string | null;
    isElectron: boolean;
    platform: string | null;
}

export const getAppVersionInfo = (): AppVersionInfo => {
    const desktopWebVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.1';
    const shellApp = getShellApp();

    return {
        desktopWebVersion,
        desktopVersion: shellApp?.appVersion ?? null,
        isElectron: shellApp !== undefined,
        platform: shellApp?.platform ?? null,
    };
};

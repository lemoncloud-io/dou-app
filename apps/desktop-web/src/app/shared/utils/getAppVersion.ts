/**
 * Get version information for this app instance.
 *
 * - desktop-web version: from vite define (__APP_VERSION__)
 * - desktop version: from window.electronAPI if available (Electron context)
 */

declare const __APP_VERSION__: string;

interface AppVersionInfo {
    desktopWebVersion: string;
    desktopVersion: string | null;
    isElectron: boolean;
    platform: string | null;
}

export const getAppVersionInfo = (): AppVersionInfo => {
    const desktopWebVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.1';
    const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined;

    let desktopVersion: string | null = null;
    let platform: string | null = null;

    if (isElectron && (window as any).electronAPI?.appVersion) {
        desktopVersion = (window as any).electronAPI.appVersion;
        platform = (window as any).electronAPI.platform || null;
    }

    return {
        desktopWebVersion,
        desktopVersion,
        isElectron,
        platform,
    };
};

export const getVersionLabel = (): string => {
    const info = getAppVersionInfo();
    if (info.isElectron && info.desktopVersion) {
        return `DoU ${info.desktopVersion} (desktop-web ${info.desktopWebVersion})`;
    }
    return `DoU ${info.desktopWebVersion} (web)`;
};

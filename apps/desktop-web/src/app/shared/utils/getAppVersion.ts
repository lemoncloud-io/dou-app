/**
 * Get version information for this app instance.
 *
 * - desktop-web version: from vite define (__APP_VERSION__)
 * - desktop version: from window.electronAPI if available (Electron context)
 */

declare const __APP_VERSION__: string;

// `window.electronAPI` is declared once, in ./electronApi.

interface AppVersionInfo {
    desktopWebVersion: string;
    desktopVersion: string | null;
    isElectron: boolean;
    platform: string | null;
}

export const getAppVersionInfo = (): AppVersionInfo => {
    const desktopWebVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.1';
    const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
    const isElectron = electronAPI !== undefined;

    return {
        desktopWebVersion,
        desktopVersion: electronAPI?.appVersion ?? null,
        isElectron,
        platform: electronAPI?.platform ?? null,
    };
};

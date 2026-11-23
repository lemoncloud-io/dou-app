import { isAppVersionAtLeast, liveShellGlobals } from '@chatic/bridges';

export const APP_VERSION_FLOOR = '0.30.0';

export interface ShellVersion {
    platform: string | undefined;
    version: string | undefined;
}

const PLAIN_VERSION = /^\d+(\.\d+){0,2}$/;

export const isBelowAppVersionFloor = ({ platform, version }: ShellVersion, floor = APP_VERSION_FLOOR): boolean => {
    if (platform !== 'ios' && platform !== 'android') return false;
    if (!version || !PLAIN_VERSION.test(version)) return false;
    return !isAppVersionAtLeast(version, floor);
};

export const readShellVersion = (): ShellVersion => {
    const { CHATIC_APP_PLATFORM: platform, CHATIC_APP_CURRENT_VERSION: version } = liveShellGlobals();
    return { platform, version };
};

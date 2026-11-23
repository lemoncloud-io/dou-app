import { type LaunchAtLoginState } from './loginItemContract';

export interface LoginItemHost {
    getLoginItemSettings: () => { openAtLogin: boolean };
    setLoginItemSettings: (settings: { openAtLogin: boolean }) => void;
}

export interface LoginItemController {
    read: () => LaunchAtLoginState;
    write: (enabled: boolean) => LaunchAtLoginState;
}

const SUPPORTED_PLATFORMS: readonly string[] = ['darwin', 'win32'];

export const LOGIN_ITEM_UNSUPPORTED: LaunchAtLoginState = { enabled: false, supported: false };

export const createLoginItem = (host: LoginItemHost, platform: string): LoginItemController => {
    const supported = SUPPORTED_PLATFORMS.includes(platform);
    const read = (): LaunchAtLoginState =>
        supported ? { enabled: host.getLoginItemSettings().openAtLogin, supported: true } : LOGIN_ITEM_UNSUPPORTED;

    return {
        read,
        write: (enabled: boolean): LaunchAtLoginState => {
            if (!supported) return LOGIN_ITEM_UNSUPPORTED;
            host.setLoginItemSettings({ openAtLogin: enabled });
            return read();
        },
    };
};

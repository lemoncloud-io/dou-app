import { type LaunchAtLoginState } from './loginItemContract';

/**
 * The slice of Electron's `app` this module needs. Injected rather than imported so the
 * module stays electron-free and therefore testable (see jest.config.js, and `webUrl.ts` /
 * `customUi.ts` for the same shape of thing).
 */
export interface LoginItemHost {
    getLoginItemSettings: () => { openAtLogin: boolean };
    setLoginItemSettings: (settings: { openAtLogin: boolean }) => void;
}

export interface LoginItemController {
    read: () => LaunchAtLoginState;
    write: (enabled: boolean) => LaunchAtLoginState;
}

/**
 * Platforms where `app.setLoginItemSettings` exists — Electron marks both APIs
 * `@platform darwin,win32`. v1 ships mac + win only, and on anything else the honest answer
 * is "unsupported" rather than a toggle that silently does nothing.
 */
const SUPPORTED_PLATFORMS: readonly string[] = ['darwin', 'win32'];

/** The one answer for "this build cannot register a login item" — the IPC gate returns it too. */
export const LOGIN_ITEM_UNSUPPORTED: LaunchAtLoginState = { enabled: false, supported: false };

/**
 * Launch-at-login, wrapped so the OS call has one caller and one test.
 *
 * Both `read` and `write` answer from `getLoginItemSettings()` — the OS is the state, this
 * holds none. That matters on macOS 13+, where a registration can come back
 * `requires-approval` and leave `openAtLogin` false: echoing the requested value would show
 * the user a switch that is on while the app will not actually start.
 */
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

import type { DevicePlatform } from '@lemoncloud/chatic-sockets-lib';

/**
 * What a socket says about its device on `device.save`. The server derives the device's kind
 * (mobile · desktop · web) from `platform`, so this is what decides how the device shows up in my
 * device list. `name` is the human label on that row; left out, the server falls back to the user
 * agent.
 */
export interface SocketDeviceIdentity {
    platform: Extract<DevicePlatform, 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'web'>;
    name?: string;
}

/** The inputs the decision reads — the shell-injected globals and the user agent. */
export interface DeviceEnvironment {
    /** `window.CHATIC_APP_PLATFORM`: `ios` · `android` from the mobile shell, `desktop` from Electron, absent in a browser. */
    appPlatform?: string;
    userAgent?: string;
}

type ShellGlobals = { CHATIC_APP_PLATFORM?: string };

/**
 * Reads the globals straight off `window` rather than through device-utils' `deviceInfoStore`: that
 * store is filled by a React hook on mount, and the first socket can be created before it runs. The
 * shells inject these globals before the page's own script, so they are always there to read.
 */
export const readDeviceEnvironment = (): DeviceEnvironment => {
    if (typeof window === 'undefined') return {};
    const globals = window as unknown as ShellGlobals;
    return {
        appPlatform: globals.CHATIC_APP_PLATFORM,
        userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
    };
};

type OsName = 'iOS' | 'Android' | 'ChromeOS' | 'macOS' | 'Windows' | 'Linux';

// Order matters: iPadOS and Android user agents also carry the words the later rows look for.
const OS_PATTERNS: ReadonlyArray<[RegExp, OsName]> = [
    [/iPhone|iPad|iPod/, 'iOS'],
    [/Android/, 'Android'],
    [/CrOS/, 'ChromeOS'],
    [/Macintosh|Mac OS X/, 'macOS'],
    [/Windows/, 'Windows'],
    [/Linux|X11/, 'Linux'],
];

// Order matters: every Chromium browser also says `Chrome/`, and every iOS/Chromium one `Safari/`.
const BROWSER_PATTERNS: ReadonlyArray<[RegExp, string]> = [
    [/Edg(?:e|A|iOS)?\//, 'Edge'],
    [/SamsungBrowser\//, 'Samsung Internet'],
    [/Whale\//, 'Whale'],
    [/OPR\/|OPT\/|OPiOS\/|Opera/, 'Opera'],
    [/Firefox\/|FxiOS\//, 'Firefox'],
    [/Chrome\/|CriOS\//, 'Chrome'],
    [/Safari\//, 'Safari'],
];

const match = <T>(patterns: ReadonlyArray<[RegExp, T]>, userAgent: string): T | undefined =>
    patterns.find(([pattern]) => pattern.test(userAgent))?.[1];

const DESKTOP_PLATFORM: Partial<Record<OsName, SocketDeviceIdentity['platform']>> = {
    macOS: 'macos',
    Windows: 'windows',
    Linux: 'linux',
    ChromeOS: 'linux',
};

/**
 * Decides `platform` (and `name`) for `device.save`:
 * - mobile shell — `ios` · `android` as injected. Not named: the only model global the shell injects,
 *   `CHATIC_APP_DEVICE_MODEL`, is `DeviceInfo.getDeviceId()` — `iPhone17,1` on iOS, the board codename
 *   (`panther`) on Android — and the server writes `name` over the row on every save, so sending it
 *   would replace the user-agent label with a code no one recognises.
 * - desktop shell — the operating system from the user agent (`macos` · `windows` · `linux`). Not
 *   named either: its `CHATIC_APP_DEVICE_MODEL` is Node's `process.platform`, not a model.
 * - anything else — a browser, so `web`, named `<browser> · <OS>` when both are recognised.
 */
export const resolveSocketDevice = (environment: DeviceEnvironment = readDeviceEnvironment()): SocketDeviceIdentity => {
    const { appPlatform } = environment;
    const userAgent = environment.userAgent ?? '';

    if (appPlatform === 'ios' || appPlatform === 'android') return { platform: appPlatform };

    const os = match(OS_PATTERNS, userAgent);
    if (appPlatform === 'desktop') {
        // Electron only runs on the three desktop systems; an unreadable user agent falls back to the
        // browser value rather than inventing an OS.
        return { platform: (os && DESKTOP_PLATFORM[os]) ?? 'web' };
    }

    const browser = match(BROWSER_PATTERNS, userAgent);
    return browser && os ? { platform: 'web', name: `${browser} · ${os}` } : { platform: 'web' };
};

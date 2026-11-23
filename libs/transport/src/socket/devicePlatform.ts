import { transportPlatform } from '../platform';

import type { DevicePlatform } from '@lemoncloud/chatic-sockets-lib';
import type { DeviceEnvironment } from '../platform';

export interface SocketDeviceIdentity {
    platform: Extract<DevicePlatform, 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'web'>;
    name?: string;
}

type OsName = 'iOS' | 'Android' | 'ChromeOS' | 'macOS' | 'Windows' | 'Linux';

const OS_PATTERNS: ReadonlyArray<[RegExp, OsName]> = [
    [/iPhone|iPad|iPod/, 'iOS'],
    [/Android/, 'Android'],
    [/CrOS/, 'ChromeOS'],
    [/Macintosh|Mac OS X/, 'macOS'],
    [/Windows/, 'Windows'],
    [/Linux|X11/, 'Linux'],
];

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

export const userAgentLabel = (userAgent: string): string | undefined => {
    const os = match(OS_PATTERNS, userAgent);
    const browser = match(BROWSER_PATTERNS, userAgent);
    if (browser && os) return `${browser} · ${os}`;
    return os;
};

export const resolveSocketDevice = (
    environment: DeviceEnvironment = transportPlatform.ports().device()
): SocketDeviceIdentity => {
    const { appPlatform } = environment;
    const userAgent = environment.userAgent ?? '';

    if (appPlatform === 'ios' || appPlatform === 'android') return { platform: appPlatform };

    const os = match(OS_PATTERNS, userAgent);
    if (appPlatform === 'desktop') {
        return { platform: (os && DESKTOP_PLATFORM[os]) ?? 'web' };
    }

    const browser = match(BROWSER_PATTERNS, userAgent);
    return browser && os ? { platform: 'web', name: userAgentLabel(userAgent) } : { platform: 'web' };
};

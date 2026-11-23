import type { PairingClient } from '@chatic/http';

import { resolveSocketDevice, userAgentLabel } from '@chatic/transport';
import type { DeviceEnvironment } from '@chatic/transport';

export const pairingClientOf = (environment?: DeviceEnvironment): Pick<PairingClient, 'name' | 'platform'> => {
    const { platform, name } = resolveSocketDevice(environment);
    if (platform === 'ios') return { name: 'iPhone', platform };
    if (platform === 'android') return { name: 'Android', platform };
    return name ? { name, platform } : { platform };
};

const DESKTOP_OS: Record<string, string> = { macos: 'macOS', windows: 'Windows', linux: 'Linux' };

export const deviceDisplayName = (device: { name?: string; platform?: string }): string | undefined => {
    if (device.platform === 'ios') return 'iPhone';
    if (device.platform === 'android') return 'Android';
    const name = device.name?.trim();
    if (!name || !/^Mozilla\/|AppleWebKit\//.test(name)) return name || undefined;
    return (device.platform && DESKTOP_OS[device.platform]) || userAgentLabel(name);
};

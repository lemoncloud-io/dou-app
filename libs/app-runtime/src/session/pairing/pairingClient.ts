import type { PairingClient } from '@chatic/http';

import { resolveSocketDevice, userAgentLabel, type DeviceEnvironment } from '../../socket/devicePlatform';

/**
 * What the requesting device tells the approving one about itself — the same platform and label its
 * socket saves, so the approval screen and the device list name it the same way.
 *
 * A phone carries no readable model (its injected one is a hardware id), so it is named after its
 * system; the approval screen tells a phone from a browser by `platform` anyway.
 */
export const pairingClientOf = (environment?: DeviceEnvironment): Pick<PairingClient, 'name' | 'platform'> => {
    const { platform, name } = resolveSocketDevice(environment);
    if (platform === 'ios') return { name: 'iPhone', platform };
    if (platform === 'android') return { name: 'Android', platform };
    return name ? { name, platform } : { platform };
};

const DESKTOP_OS: Record<string, string> = { macos: 'macOS', windows: 'Windows', linux: 'Linux' };

/**
 * The name a device list shows for one of my devices.
 *
 * Phones and the desktop app save no name of their own (`resolveSocketDevice` says why), so the server
 * keeps the user agent in its place, and shown as it is that is a line of `Mozilla/5.0 (…)`. A phone is
 * named after its system, the way it introduces itself to an approver; the desktop app after its OS
 * (the row's kind already says it is the desktop app); any other user agent as `<browser> · <OS>`. A
 * name that is not a user agent — what a browser saves — is kept. `undefined` when there is nothing to
 * show, so the screen can say "unknown device".
 */
export const deviceDisplayName = (device: { name?: string; platform?: string }): string | undefined => {
    if (device.platform === 'ios') return 'iPhone';
    if (device.platform === 'android') return 'Android';
    const name = device.name?.trim();
    if (!name || !/^Mozilla\/|AppleWebKit\//.test(name)) return name || undefined;
    return (device.platform && DESKTOP_OS[device.platform]) || userAgentLabel(name);
};

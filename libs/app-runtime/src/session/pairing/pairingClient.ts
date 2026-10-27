import type { PairingClient } from '@chatic/http';

import { resolveSocketDevice, type DeviceEnvironment } from '../../socket/devicePlatform';

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

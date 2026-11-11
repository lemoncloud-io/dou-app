import { useState } from 'react';

import { createConnectionController } from '@chatic/runtime-core';
import type { ConnectionController } from '@chatic/runtime-core';

import { readSessionDeviceId, resolveDeviceIds } from '../../session/hooks/app/useDynamicDeviceId';

/**
 * The host's connection controller: one per mounted host, made on first render and kept. Making it
 * starts nothing — the host's effects start and stop its two halves.
 *
 * The device id is the one `useDynamicDeviceId` resolves, read on each of the controller's passes: the
 * page's own id is fixed here once, the shell's injected ids are re-read from `window` every time.
 */
export const useConnectionController = (): ConnectionController => {
    const [controller] = useState(() => {
        const sessionDeviceId = readSessionDeviceId();
        return createConnectionController({ deviceId: () => resolveDeviceIds(sessionDeviceId).deviceId });
    });
    return controller;
};

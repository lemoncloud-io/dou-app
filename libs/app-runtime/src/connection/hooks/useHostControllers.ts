import { useState } from 'react';

import { createConnectionController, createSessionController } from '@chatic/runtime-core';
import type { ConnectionController, SessionController } from '@chatic/runtime-core';

import { readSessionDeviceId, resolveDeviceIds } from '../../session/hooks/app/useDynamicDeviceId';

export interface HostControllers {
    session: SessionController;
    connection: ConnectionController;
}

/**
 * The host's two controllers, from runtime-core: the session's lifecycle and the connections. Made on
 * first render and kept for the host's lifetime; making them starts nothing — the host's effects
 * start and stop them.
 *
 * Both read the device id that `useDynamicDeviceId` resolves, on each of their passes: the page's own
 * id is fixed here once, the shell's injected ids are re-read from `window` every time.
 */
export const useHostControllers = (): HostControllers => {
    const [controllers] = useState<HostControllers>(() => {
        const sessionDeviceId = readSessionDeviceId();
        const deviceId = () => resolveDeviceIds(sessionDeviceId).deviceId;
        return {
            session: createSessionController({ deviceId }),
            connection: createConnectionController({ deviceId }),
        };
    });
    return controllers;
};

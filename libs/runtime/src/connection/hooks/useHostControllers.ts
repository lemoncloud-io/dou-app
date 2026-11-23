import { useState } from 'react';

import { lazySessionDeviceId, runtimeEngine } from '@chatic/runtime-client';
import type { ConnectionController, SessionController } from '@chatic/runtime-client';

import { resolveDeviceIds } from '../../session/hooks/app/useDynamicDeviceId';

export interface HostControllers {
    session: SessionController;
    connection: ConnectionController;
}

export const useHostControllers = (): HostControllers => {
    const [controllers] = useState<HostControllers>(() => {
        const sessionDeviceId = lazySessionDeviceId();
        const deviceId = () => resolveDeviceIds(sessionDeviceId).deviceId;
        const engine = runtimeEngine();
        return {
            session: engine.sessionController({ deviceId }),
            connection: engine.connectionController({ deviceId }),
        };
    });
    return controllers;
};

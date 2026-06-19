import { useMemo } from 'react';

import type { DataContext } from '@chatic/data';
import { useGlobalSession } from '@chatic/web-core';

import type { SocketBindingConfig } from '../socket';
import { useDynamicDeviceId } from '@chatic/web-core';

export interface RuntimeBinding {
    context: DataContext;
    socket: {
        config: SocketBindingConfig;
    } | null;
}

export const useRuntimeBinding = (): RuntimeBinding => {
    const { deviceId } = useDynamicDeviceId();
    const session = useGlobalSession();

    return useMemo(() => {
        const { activeServer, identity } = session;
        const cid = activeServer.kind === 'cloud' ? activeServer.cloudId : 'default';
        const sid = activeServer.siteId ?? undefined;
        const uid = identity.activeProfile?.uid ?? undefined;
        const endpoint = activeServer.wss;
        const wssType = activeServer.kind;

        return {
            context: { cid, sid, uid },
            socket:
                deviceId && endpoint
                    ? {
                          config: {
                              url: endpoint,
                              deviceId,
                              wssType,
                          },
                      }
                    : null,
        };
    }, [deviceId, session]);
};

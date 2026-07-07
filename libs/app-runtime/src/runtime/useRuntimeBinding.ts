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
    auth: {
        kind: 'relay' | 'cloud';
        siteId?: string;
        identityToken?: string;
    } | null;
}

export const useRuntimeBinding = (): RuntimeBinding => {
    const { deviceId } = useDynamicDeviceId();
    const session = useGlobalSession();

    return useMemo(() => {
        const { activeServer, cloud, identity } = session;
        // Cache scope (cid) follows the SELECTED cloud, not the authed one. A cloud switch
        // pre-applies the cid optimistically (before the token exchange), so cid-scoped
        // observe streams re-subscribe to the target cloud's cache immediately — mirroring
        // how the optimistic sid drives site switches. socket/auth below stay on activeServer,
        // which only flips to the new cloud once its tokens commit (isActive).
        const selectedCloudId = cloud?.cloudId ?? undefined;
        const cid = selectedCloudId && selectedCloudId !== 'default' ? selectedCloudId : 'default';
        const sid = activeServer.siteId ?? undefined;
        const uid = identity.userId ?? undefined;
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
                              cid,
                          },
                      }
                    : null,
            auth: {
                kind: activeServer.kind,
                siteId: sid,
                identityToken: activeServer.identityToken ?? undefined,
            },
        };
    }, [deviceId, session]);
};

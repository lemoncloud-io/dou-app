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
        const identityToken = activeServer.identityToken ?? undefined;

        return {
            context: { cid, sid, uid },
            // Gate the socket on identityToken too: relay wss is a static env value present before
            // login, so gating on deviceId+endpoint alone would boot the socket before a token
            // exists — bootstrap would run once with no registration and never retry. A token
            // refresh only changes the token value (not url/deviceId/wssType), so config stays
            // stable and the socket is not rebooted; login (null→token) turns it on, logout off.
            // (multi-socket-design.md §6-3)
            socket:
                deviceId && endpoint && identityToken
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

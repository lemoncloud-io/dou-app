import { useMemo } from 'react';

import type { DataContext } from '@chatic/data';
import { useGlobalSession } from '@chatic/web-core';

import type { SocketBindingConfig } from '../socket';
import { useDynamicDeviceId } from '@chatic/web-core';

/** One socket slot's binding config (undefined when that slot is gated off). */
export interface RuntimeSocketSlot {
    config: SocketBindingConfig;
}

export interface RuntimeBinding {
    context: DataContext;
    /**
     * Dual sockets: relay is always-on (once a relay token exists), cloud is present only while a
     * cloud session is active. SocketBinder boots each slot independently. (multi-socket-design.md §5-2)
     */
    socket: {
        relay?: RuntimeSocketSlot;
        cloud?: RuntimeSocketSlot;
    };
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
        const { activeServer, relay, cloud, identity } = session;
        // Cache scope (cid) follows the SELECTED cloud, not the authed one — a cloud switch
        // pre-applies the cid optimistically (before the token exchange), so cid-scoped observe
        // streams re-subscribe to the target cloud's cache immediately.
        const selectedCloudId = cloud?.cloudId ?? undefined;
        const cid = selectedCloudId && selectedCloudId !== 'default' ? selectedCloudId : 'default';
        const sid = activeServer.siteId ?? undefined;
        const uid = identity.userId ?? undefined;

        // Each slot is gated on its OWN server having a token (relay wss is a static env value present
        // before login, so gating on wss alone would boot before a token exists). identityToken is
        // NOT in the config, so a token refresh (value change) leaves the config stable and does not
        // reboot the socket; login (null→token) turns a slot on, logout off. (§6-3)
        const relaySlot: RuntimeSocketSlot | undefined =
            deviceId && relay.wss && relay.identityToken
                ? { config: { url: relay.wss, deviceId, wssType: 'relay', cid: 'default' } }
                : undefined;
        // Cloud slot only while a cloud session is active; its cid is the COMMITTED cloud (cloud
        // context reads committed tokens), so it stays frozen through an optimistic cid pre-apply.
        const cloudSlot: RuntimeSocketSlot | undefined =
            deviceId && cloud.isActive && cloud.wss && cloud.identityToken
                ? { config: { url: cloud.wss, deviceId, wssType: 'cloud', cid: cloud.cloudId ?? 'default' } }
                : undefined;

        return {
            context: { cid, sid, uid },
            socket: { relay: relaySlot, cloud: cloudSlot },
            auth: {
                kind: activeServer.kind,
                siteId: sid,
                identityToken: activeServer.identityToken ?? undefined,
            },
        };
    }, [deviceId, session]);
};

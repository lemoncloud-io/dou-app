import { useMemo } from 'react';

import { useDynamicDeviceId, useGlobalSession } from '@chatic/web-core';

import type { RuntimeBinding, RuntimeSocketSlot } from './types';

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
        // carried as a sibling of `config` (NOT inside it): SocketBinder's reboot key reads only
        // `config`, so a token refresh leaves the config stable and does not reboot the socket, while
        // SocketReauthBinder watches this per-slot `identityToken` to re-authenticate in place on a
        // same-connection identity swap (guest→social). The CLOUD slot deliberately carries no
        // identityToken (a535055a): a cloud switch is assumed to change the wss URL and reboot via
        // SocketBinder — see the same-wss caveat in SocketReauthBinder / 2026-08 session audit §5-7.
        // Login (null→token) turns a slot on, logout off. (§6-3, §6-7)
        const relaySlot: RuntimeSocketSlot | undefined =
            deviceId && relay.wss && relay.identityToken
                ? {
                      config: { url: relay.wss, deviceId, wssType: 'relay', cid: 'default' },
                      identityToken: relay.identityToken,
                  }
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
        };
    }, [deviceId, session]);
};

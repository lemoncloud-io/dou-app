import { useMemo } from 'react';

import { getCommittedCloudId, useDynamicDeviceId, useGlobalSession } from '../session';

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
        // same-connection identity swap (guest→social). The CLOUD slot carries no identityToken
        // (a535055a) and that is an invariant, not an assumption: no two clouds share a wss host
        // (confirmed 2026-09-02), so every cloud switch changes the URL and reboots the slot through
        // SocketBinder, leaving no live connection to re-authenticate. A violation would be silent,
        // so SocketBinder's same-wss guard reports it. Login (null→token) turns a slot on, logout
        // off. (§6-3, §6-7)
        const relaySlot: RuntimeSocketSlot | undefined =
            deviceId && relay.wss && relay.identityToken
                ? {
                      config: { url: relay.wss, deviceId, wssType: 'relay', cid: 'default' },
                      identityToken: relay.identityToken,
                  }
                : undefined;
        // Cloud slot only while a cloud session is active. Its cid is the COMMITTED cloud, read from
        // the delegation token — NOT `cloud.cloudId`, which is the SELECTED id and flips at the start
        // of a switch. The old code claimed committed in its comment but passed the selected value, so
        // during the optimistic window the slot carried the TARGET cid next to the OUTGOING cloud's
        // `wss`/`identityToken` — a config describing two different clouds (ADR-0070 결정 7의 세 뷰).
        const committedCloudId = getCommittedCloudId();
        const cloudSlot: RuntimeSocketSlot | undefined =
            deviceId && cloud.isActive && cloud.wss && cloud.identityToken
                ? { config: { url: cloud.wss, deviceId, wssType: 'cloud', cid: committedCloudId ?? 'default' } }
                : undefined;

        return {
            context: { cid, sid, uid },
            socket: { relay: relaySlot, cloud: cloudSlot },
        };
    }, [deviceId, session]);
};

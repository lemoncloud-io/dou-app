import { useMemo, useSyncExternalStore } from 'react';

import { useDynamicDeviceId } from '../../session/hooks/app/useDynamicDeviceId';
// Off the session barrel (ADR-0076 결정 6): the committed cloud id and the narrowed slot snapshot
// are runtime-internal.
import { getCommittedCloudId, getSocketSlotContext, sessionSignal } from '../../session/store';
import type { SessionSignalKind } from '../../session/store';

import type { RuntimeSocketSlots } from '../types';

/**
 * The slices the slots are derived from — deliberately NOT `identity` (ADR-0076 E5).
 *
 * Every input below moves on one of these three: relay `wss`/`identityToken` on `relay:token`,
 * `cloud.isActive`/`wss`/`identityToken` and the committed cloud id on `cloud:token`, and the
 * selected cloud on `selection`. Identity has its own signal and fires without any of them — boot
 * alone emits it twice (`setSessionIdentityState`) and every login adds one, each of which used to
 * re-render this hook and hand both binders a new-but-equal slots object.
 *
 * The matching narrow snapshot (`getSocketSlotContext`) is what keeps this honest: subscribing to a
 * subset while READING the full context would render stale values silently.
 */
const SLOT_SIGNALS: readonly SessionSignalKind[] = ['relay:token', 'cloud:token', 'selection'];

/** Stable reference — `useSyncExternalStore` re-subscribes whenever this identity changes. */
const subscribeSlotSignals = (listener: () => void): (() => void) => sessionSignal.subscribe(SLOT_SIGNALS, listener);

/**
 * Derives the two socket slots from the live session. This is the whole job — it used to ALSO derive
 * the cache scope (`{cid, sid, uid}`) and hand it back as `RuntimeBinding.context`, which no
 * production code read: `deriveSelectedContext` owns that formula now and consumers READ it from the
 * store instead of receiving a pushed copy (ADR-0070 결정 7 · ADR-0076 결정 1). The duplicate was
 * character-for-character identical, so the two could only ever agree or silently disagree.
 *
 * Hosts call this themselves (`RuntimeConnectionHost` · `RuntimeAuthHost`), so an app no longer
 * repeated `const binding = useRuntimeBinding()` just to pass it straight back down.
 */
export const useRuntimeSocketSlots = (): RuntimeSocketSlots => {
    const { deviceId } = useDynamicDeviceId();
    const session = useSyncExternalStore(subscribeSlotSignals, getSocketSlotContext, getSocketSlotContext);

    return useMemo(() => {
        const { relay, cloud } = session;

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
        const relaySlot =
            deviceId && relay.wss && relay.identityToken
                ? {
                      config: { url: relay.wss, deviceId, wssType: 'relay' as const, cid: 'default' },
                      identityToken: relay.identityToken,
                  }
                : undefined;
        // Cloud slot only while a cloud session is active. Its cid is the COMMITTED cloud, read from
        // the delegation token — NOT `cloud.cloudId`, which is the SELECTED id and flips at the start
        // of a switch. The old code claimed committed in its comment but passed the selected value, so
        // during the optimistic window the slot carried the TARGET cid next to the OUTGOING cloud's
        // `wss`/`identityToken` — a config describing two different clouds (ADR-0070 결정 7의 세 뷰).
        const committedCloudId = getCommittedCloudId();
        const cloudSlot =
            deviceId && cloud.isActive && cloud.wss && cloud.identityToken
                ? {
                      config: {
                          url: cloud.wss,
                          deviceId,
                          wssType: 'cloud' as const,
                          cid: committedCloudId ?? 'default',
                      },
                  }
                : undefined;

        return { relay: relaySlot, cloud: cloudSlot };
    }, [deviceId, session]);
};

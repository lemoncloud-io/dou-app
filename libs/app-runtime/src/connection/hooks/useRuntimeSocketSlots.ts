import { useMemo, useSyncExternalStore } from 'react';

import { logger } from '@chatic/bridges';
import { RELAY_CLOUD_ID } from '@chatic/data';

import { useDynamicDeviceId } from '../../session/hooks/app/useDynamicDeviceId';
// Off the session barrel (ADR-0076 Decision 6): the committed cloud id and the narrowed slot snapshot
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
 * store instead of receiving a pushed copy (ADR-0070 Decision 7 · ADR-0076 Decision 1). The duplicate was
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
        // (a535055a): every cloud switch commits a different cid, and the cid is the slot's key, so
        // SocketBinder boots the incoming cloud as a new slot and tears the outgoing one down —
        // there is no live connection left to re-authenticate. Login (null→token) turns a slot on,
        // logout off. (§6-3, §6-7)
        const relaySlot =
            deviceId && relay.wss && relay.identityToken
                ? {
                      config: { url: relay.wss, deviceId, wssType: 'relay' as const, cid: RELAY_CLOUD_ID },
                      identityToken: relay.identityToken,
                  }
                : undefined;
        // Cloud slot only while a cloud session is active. Its cid is the COMMITTED cloud, read from
        // the delegation token — NOT `cloud.cloudId`, which is the SELECTED id and flips at the start
        // of a switch. The old code claimed committed in its comment but passed the selected value, so
        // during the optimistic window the slot carried the TARGET cid next to the OUTGOING cloud's
        // `wss`/`identityToken` — a config describing two different clouds (the three views of
        // ADR-0070 Decision 7).
        //
        // No committed cloud means no cloud slot. This used to fall back to `'default'`, which is the
        // RELAY's cid — harmless while slots were keyed by role, but with slots keyed by the cloud they
        // serve it would name the relay's slot and replace the relay socket with a cloud one. The state
        // is only reachable with a malformed persisted delegation token (`cloudId` is required), so it
        // is reported rather than papered over.
        const committedCloudId = getCommittedCloudId();
        const cloudActive = !!(deviceId && cloud.isActive && cloud.wss && cloud.identityToken);
        if (cloudActive && !committedCloudId) {
            logger.warn(
                'SOCKET',
                '[useRuntimeSocketSlots] cloud session is active but no cloud is committed — no cloud slot'
            );
        }
        const cloudSlot =
            cloudActive && committedCloudId && cloud.wss
                ? {
                      config: {
                          url: cloud.wss,
                          deviceId,
                          wssType: 'cloud' as const,
                          cid: committedCloudId,
                      },
                  }
                : undefined;

        return { relay: relaySlot, cloud: cloudSlot };
    }, [deviceId, session]);
};

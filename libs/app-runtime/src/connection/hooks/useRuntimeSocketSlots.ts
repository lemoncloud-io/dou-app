import { useMemo, useSyncExternalStore } from 'react';

import { logger } from '@chatic/bridges';
import { RELAY_CLOUD_ID } from '@chatic/data';

import { backgroundClouds } from '../../socket/backgroundClouds';
import { useDynamicDeviceId } from '../../session/hooks/app/useDynamicDeviceId';
// Off the session barrel (ADR-0076 Decision 6): the committed cloud id and the narrowed slot snapshot
// are runtime-internal.
import { getCommittedCloudId, getSocketSlotContext } from '../../session/store';

import type { RuntimeSocketSlots } from '../types';
import { readyBackgroundConfigs } from '../utils/backgroundSlots';
import { subscribeSlotSignals } from '../utils/slotSignals';

/**
 * Derives the socket slots from the live session: relay, the committed cloud, and a background slot
 * for each other cloud the account belongs to (`socket/backgroundClouds` decides which). This is
 * the whole job — it used to ALSO derive the cache scope (`{cid, sid, uid}`) and hand it back as `RuntimeBinding.context`, which no
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
    // The app's cloud list and the per-cloud token cache move outside the session signals.
    const backgroundVersion = useSyncExternalStore(
        backgroundClouds.subscribe,
        backgroundClouds.getVersion,
        backgroundClouds.getVersion
    );

    return useMemo(() => {
        const { relay, cloud } = session;

        // Each slot is gated on its OWN server having a token (relay wss is a static env value present
        // before login, so gating on wss alone would boot before a token exists). identityToken is
        // carried as a sibling of `config` (NOT inside it): SocketBinder's reboot key reads only
        // `config`, so a token refresh leaves the config stable and does not reboot the socket, while
        // SocketReauthBinder watches this per-slot `identityToken` to re-authenticate in place on a
        // same-connection identity swap (guest→social). The CLOUD slot carries no identityToken:
        // the cid is the slot's key, so a switch either boots the incoming cloud as a new
        // slot or lands on its background slot and commits the tokens that slot registered with —
        // either way there is no identity change on a live connection. Login (null→token) turns a
        // slot on, logout off.
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

        // Background slots ride on the relay session: their tokens are minted from it
        // (`delegate-cloud` is relay-signed), and a relay logout ends every cloud with it. Like the
        // cloud slot, a background slot carries no identityToken — its cloud's credential guard
        // re-registers it on renewal, so SocketReauthBinder has nothing to watch.
        const background = deviceId && relaySlot ? readyBackgroundConfigs(deviceId).map(config => ({ config })) : [];

        return { relay: relaySlot, cloud: cloudSlot, background };
        // `backgroundVersion` is not read in the body; it is the dependency that re-runs this when
        // the cloud list or the token cache moved.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deviceId, session, backgroundVersion]);
};

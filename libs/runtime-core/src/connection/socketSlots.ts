import { logger } from '@chatic/logger';
import { RELAY_CLOUD_ID } from '@chatic/data';
import { getCommittedCloudId, getSocketSlotContext } from '@chatic/session';

import type { RuntimeSocketSlot, RuntimeSocketSlots } from './types';
import { readyBackgroundConfigs } from './backgroundSlots';

type SlotContext = ReturnType<typeof getSocketSlotContext>;

/**
 * The relay slot, gated on the relay having a token. The relay wss is a static env value present
 * before login, so gating on the URL alone would boot a socket with nothing to authenticate with.
 */
const relaySlotOf = (
    deviceId: string | null | undefined,
    relay: SlotContext['relay']
): RuntimeSocketSlot | undefined =>
    deviceId && relay.wss && relay.identityToken
        ? {
              config: { url: relay.wss, deviceId, wssType: 'relay' as const, cid: RELAY_CLOUD_ID },
              identityToken: relay.identityToken,
          }
        : undefined;

/**
 * Whether the session has a relay slot to bind — and so whether there is a relay session to mint
 * background clouds' tokens from.
 */
export const hasRelaySlot = (deviceId: string | null | undefined): boolean =>
    relaySlotOf(deviceId, getSocketSlotContext().relay) !== undefined;

/**
 * Derives the socket slots from the live session: relay, the committed cloud, and a background slot
 * for each other cloud the account belongs to (the transport's `socket/backgroundClouds` decides which).
 * It reads the narrow slot snapshot (`getSocketSlotContext`), which carries exactly what the three
 * slot signals move (`slotSignals.ts`) — the two have to stay narrowed together, or a slot is derived
 * from a value no subscription re-reads on.
 *
 * The cache scope (`{cid, sid, uid}`) is not derived here: `deriveSelectedContext` owns that formula
 * and consumers read it from the session store.
 */
export const deriveSocketSlots = (deviceId: string | null | undefined): RuntimeSocketSlots => {
    const { relay, cloud } = getSocketSlotContext();

    // Each slot is gated on its OWN server having a token. identityToken is carried as a sibling of
    // `config` (NOT inside it): SocketBinder's reboot key reads only `config`, so a token refresh leaves
    // the config stable and does not reboot the socket, while SocketReauthBinder watches this per-slot
    // `identityToken` to re-authenticate in place on a same-connection identity swap (guest→social).
    // The CLOUD slot carries no identityToken: the cid is the slot's key, so a switch either boots the
    // incoming cloud as a new slot or lands on its background slot and commits the tokens that slot
    // registered with — either way there is no identity change on a live connection. Login
    // (null→token) turns a slot on, logout off.
    const relaySlot = relaySlotOf(deviceId, relay);
    // Cloud slot only while a cloud session is active. Its cid is the COMMITTED cloud, read from
    // the delegation token — NOT `cloud.cloudId`, which is the SELECTED id and flips at the start
    // of a switch. The old code claimed committed in its comment but passed the selected value, so
    // during the optimistic window the slot carried the TARGET cid next to the OUTGOING cloud's
    // `wss`/`identityToken` — a config describing two different clouds (the session keeps the
    // selected, bound and committed cloud as three separate views for exactly this reason).
    //
    // No committed cloud means no cloud slot. This used to fall back to `'default'`, which is the
    // RELAY's cid — harmless while slots were keyed by role, but with slots keyed by the cloud they
    // serve it would name the relay's slot and replace the relay socket with a cloud one. The state
    // is only reachable with a malformed persisted delegation token (`cloudId` is required), so it
    // is reported rather than papered over.
    const committedCloudId = getCommittedCloudId();
    const cloudActive = !!(deviceId && cloud.isActive && cloud.wss && cloud.identityToken);
    if (cloudActive && !committedCloudId) {
        logger.warn('SOCKET', '[deriveSocketSlots] cloud session is active but no cloud is committed — no cloud slot');
    }
    const cloudSlot =
        deviceId && cloudActive && committedCloudId && cloud.wss
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
};

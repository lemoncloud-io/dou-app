import { logger } from '@chatic/bridges';
import { RELAY_CLOUD_ID } from '@chatic/data';

import { isExchangeInFlight, isInviteLoginEntry, lastIssuedForOf } from '../../session/auth/cloudTokens';
import { getCommittedCloudId, getUidInCloud } from '../../session/store';
import { cloudStore } from '../../session/store/stores';
import { renewCloudSession } from './renewCloudSession';

/**
 * The delegation half this device holds for `cloudId`: the session store's while the cloud is the
 * committed one, the per-cloud cache's otherwise. The two can disagree only for a moment inside a
 * commit, and the store is the one the session and its socket derive from.
 */
const heldDelegationOf = (cloudId: string) =>
    getCommittedCloudId() === cloudId
        ? cloudStore.getDelegationToken()
        : (cloudStore.peekCachedCloudTokens(cloudId)?.delegationToken ?? null);

/**
 * How long a cloud whose renewal failed is left alone. A trigger fires on every committed cloud token,
 * and the committed cloud's own refresh commits one every few minutes, so a renewal that cannot
 * succeed (a cloud backend that is gone, a refusal) would otherwise ask `delegate-cloud` at that rate
 * until logout. In memory: a reload is a fresh start, and that is often what fixes the failure.
 */
const RETRY_AFTER_FAILURE_MS = 30 * 60_000;
const failedAt = new Map<string, number>();
const isBackingOff = (cloudId: string) => {
    const at = failedAt.get(cloudId);
    return at !== undefined && Date.now() - at < RETRY_AFTER_FAILURE_MS;
};

/**
 * Re-issues every owned cloud this device may hold as an INVITEE, so the owner gets their own user back.
 *
 * The token cache is keyed by cloud id alone, so a cloud has one held identity on a device. An invite
 * into a cloud the account also owns — an owner opening their own invite link, or a guest who
 * accepted and later signed in to the owning account — puts the invitee's token in that one slot,
 * and every later entry replays it: the owner walks into their own cloud as a member. Nothing on the
 * server is wrong; `delegate-cloud` answers an owner as the owner. The device simply stopped asking.
 *
 * Two marks find such a cloud, both from what the device itself wrote, never a role or owner id off
 * the token:
 *  - **an invite entry** — the invite login's answer, assembled with an empty delegation JWT;
 *  - **an owned cloud also cached as an invited cloud** (`alsoInvitedCloudIds`) that has not been
 *    re-issued for the relay user signed in now. The invite entry does not stay one: before the
 *    sign-in, the credential guard and the background preparer re-issue it through `delegate-cloud`
 *    as the guest, and the server answers the guest as the invitee with an ordinary signed token, the
 *    same shape as the owner's. The cached invited row is the one trace left, so such a cloud is
 *    re-issued once per relay user and recorded (`cloudStore.setReclaimedFor`). The record goes with
 *    the account at logout, so a guest who carries on and signs in again is reclaimed again.
 *
 * Only that overlap is re-issued on the second mark, never every owned cloud: a device that has no
 * invited row for a cloud cannot have taken a guest's token for it, and a wide re-issue is what a
 * withdrawn attempt at this repair shipped and rolled back. An owned-and-invited cloud this device
 * holds no token for, with no exchange on the wire for it either, has nothing to replace — the next
 * entry asks `delegate-cloud` as this account — so it is recorded without an exchange.
 *
 * A renewal joins an exchange already in flight for the cloud, and one the guest started before the
 * sign-in still answers for the guest. So a renewal is recorded only when the exchange behind it was
 * asked as the relay user signed in now (`lastIssuedForOf`); otherwise the next trigger asks again.
 *
 * Renewal, not a cache drop: it re-issues into the cache AND the store when the cloud is committed,
 * and re-registers a socket already up for it — a socket that would otherwise stay authenticated as
 * the invitee, since a cloud slot is never re-authenticated on its own. A failed renewal leaves the
 * invitee in place, unrecorded, and the cloud is left alone for `RETRY_AFTER_FAILURE_MS` before a
 * later trigger (`useReclaimOwnedClouds`) tries it again.
 *
 * Returns the clouds whose renewal succeeded.
 */
export const reclaimOwnedClouds = async (
    ownedCloudIds: readonly string[],
    alsoInvitedCloudIds: readonly string[] = []
): Promise<string[]> => {
    const relayUserId = getUidInCloud(RELAY_CLOUD_ID);
    const alsoInvited = new Set(alsoInvitedCloudIds);
    // With no relay user there is nobody to re-issue for and nothing to record the reclaim under.
    const isOwedReclaim = (cloudId: string) =>
        !!relayUserId && alsoInvited.has(cloudId) && cloudStore.getReclaimedFor(cloudId) !== relayUserId;
    const isHeld = (cloudId: string) =>
        getCommittedCloudId() === cloudId || !!cloudStore.peekCachedCloudTokens(cloudId) || isExchangeInFlight(cloudId);

    const owned = ownedCloudIds.filter(cloudId => !!cloudId && !isBackingOff(cloudId));
    for (const cloudId of owned) {
        if (relayUserId && isOwedReclaim(cloudId) && !isHeld(cloudId)) cloudStore.setReclaimedFor(cloudId, relayUserId);
    }
    const held = owned.filter(cloudId => isInviteLoginEntry(heldDelegationOf(cloudId)) || isOwedReclaim(cloudId));
    if (held.length === 0) return [];

    logger.info('SESSION', '[reclaimOwnedClouds] owned clouds possibly held as an invitee — re-issuing', {
        data: { cloudIds: held },
    });
    const results = await Promise.all(
        held.map(async cloudId => {
            if (!(await renewCloudSession(cloudId))) {
                failedAt.set(cloudId, Date.now());
                return null;
            }
            failedAt.delete(cloudId);
            // Recorded only when the exchange behind the renewal was asked as the relay user signed in
            // now, and that user still is: a joined exchange the guest started, or a sign-out while it
            // ran, leaves nothing behind to skip on.
            const askedAsNow = lastIssuedForOf(cloudId) === relayUserId;
            if (
                relayUserId &&
                alsoInvited.has(cloudId) &&
                askedAsNow &&
                getUidInCloud(RELAY_CLOUD_ID) === relayUserId
            ) {
                cloudStore.setReclaimedFor(cloudId, relayUserId);
            }
            return cloudId;
        })
    );
    return results.filter((cloudId): cloudId is string => cloudId !== null);
};

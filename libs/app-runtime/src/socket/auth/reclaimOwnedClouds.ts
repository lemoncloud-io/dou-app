import { logger } from '@chatic/bridges';

import { isInviteLoginEntry } from '../../session/auth/cloudTokens';
import { getCommittedCloudId, getRelayUserId } from '../../session/store';
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
 * Whether the device holds `cloudId` as someone other than the relay user signed in now.
 *
 * Two marks say so, and both are things the device wrote itself — never a role or an owner id off
 * the token, so neither depends on how the server spells them:
 *
 * - **An invite entry** (an empty delegation JWT). The invite login's own answer, entered as it is.
 * - **An entry issued under another relay user** (`issuedFor`). An invite entry does not stay one:
 *   the background preparer re-issues it once the cache lapses, and so does a renewal, and from then
 *   on the cache holds an ordinary `delegate-cloud` answer for the invitee — a real JWT, the same
 *   shape as the owner's. What still tells it apart is that it was issued while the GUEST was the
 *   relay user, and a sign-in to the owning account changes that user without touching the cache.
 *   An entry with no `issuedFor` predates the mark and is re-issued once, which stamps it.
 *
 * With no relay user signed in there is nothing to compare against, and nothing is reclaimed.
 */
const isHeldAsAnotherUser = (cloudId: string, relayUserId: string): boolean => {
    if (isInviteLoginEntry(heldDelegationOf(cloudId))) return true;
    const cached = cloudStore.peekCachedCloudTokens(cloudId);
    return !!cached && cached.issuedFor !== relayUserId;
};

/** Clouds whose renewal is under way, so overlapping triggers do not start a second one for each. */
const reclaiming = new Set<string>();

/**
 * Re-issues every owned cloud this device holds as another user, so the owner gets their own user
 * back.
 *
 * The token cache is keyed by cloud id alone, so a cloud has one held identity on a device. Two paths
 * leave an owned cloud held as an invitee: the owner opening their own invite link on this device,
 * and a guest who accepted an invite and later signed in to the owning account. Every later entry
 * replays the held token, and the owner walks into their own cloud as a member. Nothing on the server
 * is wrong; `delegate-cloud` answers an owner as the owner. The device simply stopped asking.
 *
 * Only OWNED clouds are considered. An invited cloud the account does not own keeps the invitee's
 * token through a sign-in on purpose: a re-issue answers for the relay user as it is now, which for a
 * sign-in the server did not link to the guest is a user with no rooms there.
 *
 * Renewal, not a cache drop: it re-issues into the cache AND the store when the cloud is committed,
 * and re-registers a socket already up for it — a socket that would otherwise stay authenticated as
 * the previous user, since a cloud slot is never re-authenticated on its own. A failed renewal leaves
 * the held token in place and is retried on the caller's next trigger (`useReclaimOwnedClouds`).
 *
 * Returns the clouds whose renewal succeeded.
 */
export const reclaimOwnedClouds = async (ownedCloudIds: readonly string[]): Promise<string[]> => {
    const relayUserId = getRelayUserId();
    if (!relayUserId) return [];
    const held = ownedCloudIds.filter(
        cloudId => !!cloudId && !reclaiming.has(cloudId) && isHeldAsAnotherUser(cloudId, relayUserId)
    );
    if (held.length === 0) return [];

    logger.info('SESSION', '[reclaimOwnedClouds] owned clouds held as another user — re-issuing', {
        data: { cloudIds: held },
    });
    held.forEach(cloudId => reclaiming.add(cloudId));
    const results = await Promise.all(
        held.map(async cloudId => {
            try {
                return (await renewCloudSession(cloudId)) ? cloudId : null;
            } finally {
                reclaiming.delete(cloudId);
            }
        })
    );
    return results.filter((cloudId): cloudId is string => cloudId !== null);
};

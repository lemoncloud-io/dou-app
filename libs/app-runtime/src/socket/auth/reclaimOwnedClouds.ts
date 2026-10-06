import { logger } from '@chatic/bridges';

import { isInviteLoginEntry } from '../../session/auth/cloudTokens';
import { getCommittedCloudId } from '../../session/store';
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
 * Re-issues every owned cloud this device holds as an INVITEE, so the owner gets their own user back.
 *
 * The token cache is keyed by cloud id alone, so a cloud has one held identity on a device. An invite
 * login into a cloud the account also owns — an owner opening their own invite link, or a guest who
 * accepted and later signed in to the owning account — puts the invitee's token in that one slot,
 * and every later entry replays it: the owner walks into their own cloud as a member. Nothing on the
 * server is wrong; `delegate-cloud` answers an owner as the owner. The device simply stopped asking.
 *
 * Detection reads only what the device wrote (an invite entry's empty delegation JWT), never a role
 * or owner id off the token, so it does not depend on how the server spells either. A cloud held by
 * a delegate-cloud issue is left alone and costs nothing.
 *
 * Renewal, not a cache drop: it re-issues into the cache AND the store when the cloud is committed,
 * and re-registers a socket already up for it — a socket that would otherwise stay authenticated as
 * the invitee, since a cloud slot is never re-authenticated on its own. A failed renewal leaves the
 * invitee in place and is retried on the caller's next trigger (`useReclaimOwnedClouds`).
 *
 * Returns the clouds whose renewal succeeded.
 */
export const reclaimOwnedClouds = async (ownedCloudIds: readonly string[]): Promise<string[]> => {
    const held = ownedCloudIds.filter(cloudId => !!cloudId && isInviteLoginEntry(heldDelegationOf(cloudId)));
    if (held.length === 0) return [];

    logger.info('SESSION', '[reclaimOwnedClouds] owned clouds held as an invitee — re-issuing', {
        data: { cloudIds: held },
    });
    const results = await Promise.all(held.map(async cloudId => ((await renewCloudSession(cloudId)) ? cloudId : null)));
    return results.filter((cloudId): cloudId is string => cloudId !== null);
};

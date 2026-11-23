import { logger } from '@chatic/logger';
import { RELAY_CLOUD_ID } from '@chatic/data';

import { isExchangeInFlight, isInviteLoginEntry, lastIssuedForOf } from '../session/cloudTokens';
import { getCommittedCloudId, getUidInCloud, cloudStore } from '@chatic/session';
import { renewCloudSession } from './renewCloudSession';

const heldDelegationOf = (cloudId: string) =>
    getCommittedCloudId() === cloudId
        ? cloudStore.getDelegationToken()
        : (cloudStore.peekCachedCloudTokens(cloudId)?.delegationToken ?? null);

const RETRY_AFTER_FAILURE_MS = 30 * 60_000;
const failedAt = new Map<string, number>();
const isBackingOff = (cloudId: string) => {
    const at = failedAt.get(cloudId);
    return at !== undefined && Date.now() - at < RETRY_AFTER_FAILURE_MS;
};

export const reclaimOwnedClouds = async (
    ownedCloudIds: readonly string[],
    alsoInvitedCloudIds: readonly string[] = []
): Promise<string[]> => {
    const relayUserId = getUidInCloud(RELAY_CLOUD_ID);
    const alsoInvited = new Set(alsoInvitedCloudIds);
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

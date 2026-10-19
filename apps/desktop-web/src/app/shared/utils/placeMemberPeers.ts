import { isCloudDm, type DomainChannel } from '@chatic/data';

import { dmCounterpartId } from './dmDisplay';

/**
 * The people of a place I have no 1:1 with there yet, each with a group channel of the place they
 * are in (the room whose members load their name).
 *
 * A place's members are the members of its group channels. Anyone with a 1:1 in the place is left
 * out — the 1:1 row already stands for them. A 1:1 belongs to the place it was opened in, so one
 * with the same person in another place does not count: they are still offered here, and opening
 * it opens this place's room. Order follows the channels; the caller sorts by display name.
 */
export const placeMemberPeers = (
    channels: readonly DomainChannel[],
    { myUid, placeId }: { myUid: string | null; placeId: string }
): Array<{ peerId: string; channelId: string }> => {
    // My cloud-side id can differ from the session id; the join rows name it.
    const mine = new Set([myUid, ...channels.map(channel => channel.$join?.userId)].filter(Boolean));
    const withDm = new Set<string>();
    for (const channel of channels) {
        if (!isCloudDm(channel) || channel.sid !== placeId) continue;
        const peerId = dmCounterpartId(channel, myUid, channel.$join?.userId);
        if (peerId) withDm.add(peerId);
    }

    const peers = new Map<string, string>();
    for (const channel of channels) {
        if (!channel.id || channel.sid !== placeId || isCloudDm(channel)) continue;
        for (const memberId of channel.memberIds ?? []) {
            if (mine.has(memberId) || withDm.has(memberId) || peers.has(memberId)) continue;
            peers.set(memberId, channel.id);
        }
    }
    return [...peers].map(([peerId, channelId]) => ({ peerId, channelId }));
};

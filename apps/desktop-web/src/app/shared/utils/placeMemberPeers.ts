import { isCloudWideChannel, type DomainChannel } from '@chatic/data';

import { dmCounterpartId } from './dmDisplay';

/**
 * The people of a place I have no 1:1 with there yet, each with a group channel of the place they
 * are in (the room whose members load their name).
 *
 * A place's members are the members of its group channels, the same reading `cloudDmPlaces` uses.
 * Anyone with a 1:1 listed in the place is left out — the 1:1 row already stands for them. Order
 * follows the channels; the caller sorts by display name.
 */
export const placeMemberPeers = (
    channels: readonly DomainChannel[],
    {
        myUid,
        placeId,
        dmPlaces,
    }: { myUid: string | null; placeId: string; dmPlaces: ReadonlyMap<string, readonly string[]> }
): Array<{ peerId: string; channelId: string }> => {
    // My cloud-side id can differ from the session id; the join rows name it.
    const mine = new Set([myUid, ...channels.map(channel => channel.$join?.userId)].filter(Boolean));
    const withDm = new Set<string>();
    for (const channel of channels) {
        if (!isCloudWideChannel(channel) || !dmPlaces.get(channel.id ?? '')?.includes(placeId)) continue;
        const peerId = dmCounterpartId(channel, myUid, channel.$join?.userId);
        if (peerId) withDm.add(peerId);
    }

    const peers = new Map<string, string>();
    for (const channel of channels) {
        if (!channel.id || channel.sid !== placeId || isCloudWideChannel(channel)) continue;
        for (const memberId of channel.memberIds ?? []) {
            if (mine.has(memberId) || withDm.has(memberId) || peers.has(memberId)) continue;
            peers.set(memberId, channel.id);
        }
    }
    return [...peers].map(([peerId, channelId]) => ({ peerId, channelId }));
};

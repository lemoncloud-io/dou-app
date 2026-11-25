import { isCloudDm, type DomainChannel } from '@chatic/runtime-react';

import { dmCounterpartId } from './dmDisplay';

export const placeMemberPeers = (
    channels: readonly DomainChannel[],
    { myUid, placeId }: { myUid: string | null; placeId: string }
): Array<{ peerId: string; channelId: string }> => {
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

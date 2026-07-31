import { useMemo } from 'react';

import type { DomainChannel } from '@chatic/data';

import { pickDmPeerId } from '../utils/dmPeer';
import { useChannelProfiles } from './useChannelProfiles';
import type { DmPeer } from './useDmPeer';

/**
 * Profile poll cadence for list surfaces. `useChannelProfiles` defaults to a room-tuned 5s, which is
 * wrong here: a list is a resident screen holding one target per row, so 5s means N requests every
 * five seconds for as long as the user sits on home. First paint does not depend on the interval —
 * the hook's one-shot bootstrap covers uncached ids.
 */
export const LIST_PROFILE_SYNC_INTERVAL_MS = 60_000;

/**
 * Batch variant of {@link useDmPeer} for channel LISTS (home, chat-room management).
 *
 * A list cannot use `useDmPeer`: that hook needs `members`/`profileMap` from `useChannelMembers`,
 * which costs a `syncChannelUsers` network call per channel. Here the peer is read straight off the
 * roster (`channel.memberIds`) and every peer's profile is fetched through ONE list-level
 * `useChannelProfiles` subscription instead of one per row.
 *
 * Returns a `channelId -> DmPeer` map holding DM channels only, so a caller can look up a row and
 * get `undefined` for anything that is not a DM.
 */
export const useDmPeers = (
    sid: string | null,
    channels: DomainChannel[],
    userId: string | null | undefined
): Map<string, DmPeer> => {
    // The peer of each DM row: the roster member that isn't me. Kept as channelId -> peerId so the
    // profile lookup below can be deduped (the same person can share several DM rows in theory).
    const peerIdByChannel = useMemo(() => {
        const map = new Map<string, string>();
        for (const channel of channels) {
            if (channel.stereo !== 'dm') continue;
            const peerId = pickDmPeerId(channel.memberIds ?? [], userId);
            if (peerId) map.set(channel.id, peerId);
        }
        return map;
    }, [channels, userId]);

    // Sorted, because `useChannelProfiles` keys its registration effect on `ids.join(',')` — an
    // order-sensitive key fed by the caller's channel order. Without the sort, a list re-ordered by
    // an incoming message (recent-activity sort) would dispose and re-register every profile target.
    const peerIds = useMemo(() => [...new Set(peerIdByChannel.values())].sort(), [peerIdByChannel]);

    const { profileMap } = useChannelProfiles(sid, peerIds, LIST_PROFILE_SYNC_INTERVAL_MS);

    return useMemo(() => {
        const map = new Map<string, DmPeer>();
        for (const [channelId, peerId] of peerIdByChannel) {
            const profile = profileMap.get(peerId);
            map.set(channelId, { id: peerId, profileNick: profile?.nick, thumbnail: profile?.thumbnail });
        }
        return map;
    }, [peerIdByChannel, profileMap]);
};

import { useMemo } from 'react';

import type { DomainProfile } from '@chatic/data';

import type { ChannelMember, ClientChannelView } from '../types';
import { pickDmPeerId } from '../utils/dmPeer';

/** The 1:1 peer (the other participant) resolved for header/settings display. */
export interface DmPeer {
    id: string;
    /**
     * The peer's site-profile nick — profile ONLY, with no member-cache fallback. Feed it to
     * `resolveDmTitle`, which owns the rest of the chain. The member-cache name is excluded on
     * purpose: it hydrates through a per-channel `syncChannelUsers` call the list surfaces cannot
     * afford, so including it here would make the room disagree with the list.
     */
    profileNick?: string;
    /**
     * Avatar URL — site profile thumbnail preferred, member-cache thumbnail fallback. Unlike the
     * nick, the fallback stays: an avatar the list happens not to have simply does not render, and
     * showing the peer's global avatar in the room is better than showing none.
     */
    thumbnail?: string;
}

/**
 * Resolves the 1:1 (DM) peer for a channel: the roster member that isn't me.
 *
 * The peer is taken from the full roster (`channel.memberIds`, falling back to the
 * observed member list) so it resolves even before the peer's join/profile syncs.
 * Returns `null` for non-DM channels or when no peer can be found (e.g. roster not
 * hydrated yet), so callers keep their own fallbacks.
 */
export const useDmPeer = (
    channel: ClientChannelView | null | undefined,
    members: ChannelMember[],
    profileMap: Map<string, DomainProfile>,
    userId: string | null | undefined
): DmPeer | null => {
    return useMemo(() => {
        if (channel?.stereo !== 'dm') return null;

        const peerId =
            pickDmPeerId(channel.memberIds ?? [], userId) ??
            pickDmPeerId(
                members.map(member => member.id),
                userId
            );
        if (!peerId) return null;

        const profile = profileMap.get(peerId);
        const member = members.find(m => m.id === peerId);
        return {
            id: peerId,
            profileNick: profile?.nick,
            thumbnail: profile?.thumbnail ?? member?.thumbnail,
        };
    }, [channel?.stereo, channel?.memberIds, members, profileMap, userId]);
};

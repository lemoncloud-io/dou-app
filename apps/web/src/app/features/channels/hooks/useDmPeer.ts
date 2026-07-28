import { useMemo } from 'react';

import type { DomainProfile } from '@chatic/data';

import type { ChannelMember, ClientChannelView } from '../types';

/** The 1:1 peer (the other participant) resolved for header/settings display. */
export interface DmPeer {
    id: string;
    /** Display name — site profile nick preferred, member-cache name as fallback. */
    nick: string;
    /** Avatar URL — site profile thumbnail preferred, member-cache thumbnail fallback. */
    thumbnail?: string;
}

/**
 * Resolves the 1:1 (DM) peer for a channel: the roster member that isn't me.
 *
 * The peer is taken from the full roster (`channel.memberIds`, falling back to the
 * observed member list) so it resolves even before the peer's join/profile syncs —
 * with the site profile (nick/thumbnail) preferred over the member-cache identity.
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
            (channel.memberIds ?? []).find(id => id && id !== userId) ??
            members.map(member => member.id).find((id): id is string => !!id && id !== userId);
        if (!peerId) return null;

        const profile = profileMap.get(peerId);
        const member = members.find(m => m.id === peerId);
        return {
            id: peerId,
            nick: profile?.nick ?? member?.nick ?? member?.name ?? '',
            thumbnail: profile?.thumbnail ?? member?.thumbnail,
        };
    }, [channel?.stereo, channel?.memberIds, members, profileMap, userId]);
};

import { useMemo } from 'react';

import type { DomainProfile } from '@chatic/data';

import type { ChannelMember, ClientChannelView } from '../types';
import { peerCloudNameOf, pickDmPeerId } from '../utils/dmPeer';

/** The 1:1 peer (the other participant) resolved for header/settings display. */
export interface DmPeer {
    id: string;
    /**
     * The peer's site-profile nick — profile ONLY. Feed it to `resolveChannelTitle`, which owns the
     * rest of the chain. The member's own record is a separate field (`cloudName`) rather than a
     * fallback folded in here, because only a cloud 1:1 reads it.
     */
    profileNick?: string;
    /**
     * The peer's cloud-profile name — their user record in the cloud's user cache, screened by
     * `peerCloudNameOf`. The title chain reads it below `profileNick`, for a cloud 1:1 only. The room
     * takes it from the members it already loads; a list takes it from the user cache, loading a
     * room's members only for a peer the cache cannot name (`useDmPeers`).
     */
    cloudName?: string;
    /**
     * The peer's site-profile photo — profile ONLY, like the nick. A profile is per-place, so the
     * member-cache (account-wide) avatar is a photo the peer never chose for this place; with no
     * profile photo the caller draws the placeholder glyph instead. It is also what `useDmPeers`
     * gives the list rows, so the room and the list cannot show two different faces.
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
        return {
            id: peerId,
            profileNick: profile?.nick,
            cloudName: peerCloudNameOf(
                members.find(member => member.id === peerId),
                peerId
            ),
            thumbnail: profile?.thumbnail,
        };
    }, [channel?.stereo, channel?.memberIds, members, profileMap, userId]);
};

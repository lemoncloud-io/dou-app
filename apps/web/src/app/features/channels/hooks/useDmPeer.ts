import { useMemo } from 'react';

import type { DomainProfile } from '@chatic/runtime-react';

import type { ChannelMember, ClientChannelView } from '../types';
import { peerCloudNameOf, pickDmPeerId } from '../utils/dmPeer';

export interface DmPeer {
    id: string;
    profileNick?: string;
    cloudName?: string;
    thumbnail?: string;
}

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

import type { DomainChannel, DomainJoin } from '@chatic/runtime';

import { pickDmPeerId } from './dmPeer';

type MembershipJoin = Pick<DomainJoin, 'joined' | 'joinedNo' | 'reason'>;

export const hasLeftChannel = (join?: MembershipJoin | null): boolean =>
    !!join && join.joined === 0 && (!!join.joinedNo || !!join.reason);

export const isDmPeerMissing = (
    channel: Pick<DomainChannel, 'stereo' | 'memberIds'> | null | undefined,
    userId: string | null | undefined
): boolean => {
    if (channel?.stereo !== 'dm' || !userId) return false;
    const roster = channel.memberIds;
    if (!roster?.length) return false;
    return !pickDmPeerId(roster, userId);
};

type RosterChannel = Pick<DomainChannel, 'memberIds'>;
type SelfChatChannel = Pick<DomainChannel, 'stereo' | 'ownerId'>;

export const isChannelMember = (
    channel: RosterChannel | null | undefined,
    myJoin: Pick<DomainJoin, 'joined'> | null | undefined,
    userId: string | null | undefined
): boolean => {
    if (!userId) return false;
    if (channel?.memberIds?.includes(userId)) return true;
    return !!myJoin && myJoin.joined !== 0;
};

export const isNotMyChannel = (
    channel: Pick<DomainChannel, 'stereo' | 'memberIds'> | null | undefined,
    myJoin: Pick<DomainJoin, 'joined'> | null | undefined,
    userId: string | null | undefined
): boolean => {
    if (channel?.stereo !== 'dm' || !userId) return false;
    const roster = channel.memberIds;
    if (!roster?.length) return false;
    if (roster.includes(userId)) return false;
    return !myJoin || myJoin.joined === 0;
};

export const isSomeoneElsesSelfChat = (
    channel: SelfChatChannel | null | undefined,
    userId: string | null | undefined
): boolean => !!channel && !!userId && channel.stereo === 'self' && !!channel.ownerId && channel.ownerId !== userId;

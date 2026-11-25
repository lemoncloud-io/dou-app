import { isRelayDm, RELAY_CLOUD_ID, type DomainChannel } from '@chatic/runtime-react';

type ChannelStereo = DomainChannel['stereo'];

export type ChannelKind = 'self' | 'dm' | 'group';

export const channelKindOf = (stereo: ChannelStereo): ChannelKind => {
    switch (stereo) {
        case 'self':
            return 'self';
        case 'dm':
            return 'dm';
        case 'public':
        case 'private':
        case '':
        case undefined:
            return 'group';
        default: {
            const unhandled: never = stereo;
            void unhandled;
            return 'group';
        }
    }
};

export const showsMemberCount = (kind: ChannelKind): boolean => {
    switch (kind) {
        case 'self':
        case 'dm':
            return false;
        case 'group':
            return true;
    }
};

type OwnerRuleRoom = Pick<DomainChannel, 'stereo' | 'ownerId'>;

type OwnerRuleJoin = { stereo?: string | null; userId?: string };

export const isRoomOwner = (
    room: OwnerRuleRoom | null | undefined,
    join: OwnerRuleJoin | null | undefined,
    userId?: string | null
): boolean => {
    if (!room || channelKindOf(room.stereo) !== 'group') return false;
    const ownJoin = join && userId && join.userId && join.userId !== userId ? undefined : join;
    if (ownJoin?.stereo != null) return ownJoin.stereo === 'owner';
    const memberId = ownJoin?.userId || userId;
    return !!memberId && !!room.ownerId && room.ownerId === memberId;
};

export const roomOwnerIdOf = (
    room: OwnerRuleRoom | null | undefined,
    joins: ReadonlyArray<OwnerRuleJoin>
): string | undefined => {
    if (!room || channelKindOf(room.stereo) !== 'group') return undefined;
    const byRole = joins.find(join => !!join.userId && join.stereo === 'owner');
    if (byRole) return byRole.userId;
    const creatorId = room.ownerId;
    if (!creatorId) return undefined;
    return isRoomOwner(
        room,
        joins.find(join => join.userId === creatorId),
        creatorId
    )
        ? creatorId
        : undefined;
};

export type ChannelRemoval = 'leave' | 'delete' | 'none';

export const removalActionFor = (kind: ChannelKind, isChannelOwner: boolean): ChannelRemoval => {
    switch (kind) {
        case 'self':
            return 'none';
        case 'dm':
            return 'leave';
        case 'group':
            return isChannelOwner ? 'delete' : 'leave';
    }
};

export type DmLineage = 'relay' | 'cloud';

export const dmLineageOf = (
    channel: Pick<DomainChannel, 'stereo' | 'cid'> | null | undefined
): DmLineage | undefined => {
    if (!channel || channelKindOf(channel.stereo) !== 'dm') return undefined;
    return channel.cid === RELAY_CLOUD_ID ? 'relay' : 'cloud';
};

export const resolveDmPeerName = (
    channel: Pick<DomainChannel, 'stereo' | 'cid'> | null | undefined,
    peer: { profileNick?: string; cloudName?: string } | null | undefined
): string | undefined => {
    const profileNick = peer?.profileNick?.trim();
    if (profileNick) return profileNick;
    return dmLineageOf(channel) === 'cloud' ? peer?.cloudName?.trim() || undefined : undefined;
};

export const isInCloudSelfSection = (channel: Pick<DomainChannel, 'stereo' | 'cid'> | null | undefined): boolean =>
    channel?.stereo === 'self' && channel.cid !== RELAY_CLOUD_ID;

export const hasDmInviteFlow = (channel: Pick<DomainChannel, 'stereo' | 'cid'> | null | undefined): boolean =>
    dmLineageOf(channel) === 'relay';

export const profilePlaceOf = (
    channel: Pick<DomainChannel, 'sid' | 'stereo' | 'cid'> | null | undefined,
    activeSid: string | null | undefined
): string | null => {
    if (!channel) return null;
    if (isRelayDm(channel)) return activeSid ?? null;
    return channel.sid && channel.sid !== '#' ? channel.sid : (activeSid ?? null);
};

export const canStartDmFromProfile = ({
    room,
    sessionCloudId,
    sessionPlaceId,
    memberId,
    isMe,
}: {
    room: Pick<DomainChannel, 'stereo' | 'cid' | 'sid'> | null | undefined;
    sessionCloudId: string | null | undefined;
    sessionPlaceId: string | null | undefined;
    memberId: string | null | undefined;
    isMe: (id: string) => boolean;
}): boolean => {
    if (!room || !room.cid || room.cid === RELAY_CLOUD_ID) return false;
    if (channelKindOf(room.stereo) !== 'group') return false;
    if (room.cid !== sessionCloudId) return false;
    if (!sessionPlaceId || room.sid !== sessionPlaceId) return false;
    return !!memberId && !isMe(memberId);
};

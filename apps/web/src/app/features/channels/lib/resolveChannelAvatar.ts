import type { DomainChannel } from '@chatic/runtime-react';

export type ChannelAvatarGlyph = 'user' | 'group';

export interface ResolvedChannelAvatar {
    src?: string;
    glyph: ChannelAvatarGlyph;
}

export interface ResolveChannelAvatarInput {
    channel: Pick<DomainChannel, 'stereo' | 'thumbnail'>;
    myThumbnail?: string;
    peerThumbnail?: string;
}

export const resolveChannelAvatar = ({
    channel,
    myThumbnail,
    peerThumbnail,
}: ResolveChannelAvatarInput): ResolvedChannelAvatar => {
    if (channel.stereo === 'self') {
        return { src: channel.thumbnail?.trim() || myThumbnail?.trim() || undefined, glyph: 'user' };
    }
    if (channel.stereo === 'dm') return { src: peerThumbnail?.trim() || undefined, glyph: 'user' };
    return { src: channel.thumbnail?.trim() || undefined, glyph: 'group' };
};

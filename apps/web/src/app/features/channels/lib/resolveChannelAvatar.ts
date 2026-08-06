import type { DomainChannel } from '@chatic/data';

export interface ResolveChannelAvatarInput {
    channel: Pick<DomainChannel, 'stereo' | 'thumbnail'>;
    /** My active-place profile photo — a self chat's only member is me, so it IS the room's photo. */
    myThumbnail?: string;
    /** The DM peer's place-profile photo. Ignored for non-DM channels. */
    peerThumbnail?: string;
}

/**
 * Photo for a channel's representative avatar, shared by the home list, the chat-room management
 * list, the room header and the settings screen so the four can't drift apart:
 *   - self → MY place-profile photo
 *   - dm   → the peer's place-profile photo
 *   - else → the channel's own photo
 *
 * Both the self and the DM branch ignore `channel.thumbnail`: neither room has a photo of its own
 * (there is no UI that sets one — settings routes both stereos to the join-nick dialog), and the
 * row stands for a person, not a room. Returns undefined when nothing usable is set, which is the
 * caller's cue to render its placeholder glyph.
 */
export const resolveChannelAvatar = ({
    channel,
    myThumbnail,
    peerThumbnail,
}: ResolveChannelAvatarInput): string | undefined => {
    if (channel.stereo === 'self') return myThumbnail?.trim() || undefined;
    if (channel.stereo === 'dm') return peerThumbnail?.trim() || undefined;
    return channel.thumbnail?.trim() || undefined;
};

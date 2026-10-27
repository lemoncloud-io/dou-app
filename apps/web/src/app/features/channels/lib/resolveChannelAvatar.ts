import type { DomainChannel } from '@chatic/data';

/** Placeholder glyph for a channel with no photo — a person for the rooms that stand for a person. */
export type ChannelAvatarGlyph = 'user' | 'group';

export interface ResolvedChannelAvatar {
    /** Photo to render, or undefined when the caller should draw the `glyph` placeholder instead. */
    src?: string;
    glyph: ChannelAvatarGlyph;
}

export interface ResolveChannelAvatarInput {
    channel: Pick<DomainChannel, 'stereo' | 'thumbnail'>;
    /** My active-place profile photo — a self chat's photo until the room is given one of its own. */
    myThumbnail?: string;
    /** The DM peer's place-profile photo. Ignored for non-DM channels. */
    peerThumbnail?: string;
}

/**
 * Representative avatar for a channel — photo AND placeholder glyph — shared by the home list, the
 * chat-room management list, the room header and the settings screen so the four can't drift apart:
 *   - self → the room's own photo once one is set, else MY place-profile photo, person glyph
 *   - dm   → the peer's place-profile photo, person glyph
 *   - else → the channel's own photo, group glyph
 *
 * A self chat's photo is set from its name dialog and only I see it (the room has one member). The
 * DM branch ignores `channel.thumbnail`: a 1:1 has no photo of its own (no UI sets one), and the row
 * stands for the person on the other side.
 *
 * The glyph travels WITH the photo rather than being decided per screen, because it keys off the same
 * stereo branch: choosing them apart is what left a group room showing a one-person glyph in the home
 * list and a chat-bubble placeholder in settings, where Figma (3164-12515) has the navy circle with
 * the two-person glyph in both.
 */
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

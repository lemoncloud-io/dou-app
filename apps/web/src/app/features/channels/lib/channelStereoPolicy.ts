import type { DomainChannel } from '@chatic/data';

/** The server's `ChannelStereo`, plus the absent case a cached row can carry. */
type ChannelStereo = DomainChannel['stereo'];

/**
 * The three kinds this client has rules for.
 *
 * The server's `ChannelStereo` has FIVE values — `'' | 'public' | 'private' | 'dm' | 'self'` — and
 * the client folds three of them into one kind. That folding is a decision, not an accident, so it
 * is written down here once instead of being re-derived as `!isSelf && !isDm` at each call site.
 * Today only `private` is ever created by this app and nothing reads `public`, but the day a rule
 * attaches to `public` the negative form would swallow it silently.
 */
export type ChannelKind = 'self' | 'dm' | 'group';

/**
 * Which kind a channel is. `stereo` is the ONLY input — never the member count.
 *
 * A `memberNo === 1` test looks equivalent to "self chat" and is not: an empty group reads as one
 * under it, and a DM whose peer left reads as one too. The same trap in reverse gave a group room a
 * one-person glyph in the home list. Stereo, never member count.
 *
 * The `default` branch cannot be reached by any current value; it exists so that ADDING a value to
 * `ChannelStereo` fails to compile here rather than being folded into `group` unnoticed. It still
 * returns `group` at runtime, because a stereo this build has never heard of is far more likely to
 * be a group than a reason to crash a list.
 */
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

/**
 * Whether a row shows the member count beside the name.
 *
 * Only a group's count carries information. A self chat is always 1 and a DM is always 2, so the
 * number tells the reader nothing they cannot see from the row itself.
 *
 * The home list used to get this right by accident: it hid the count for DMs explicitly and for
 * self chats only because `memberNo > 1` happened to be false. That held until something counted
 * one more member into a self chat, at which point the number would have appeared with nobody
 * having decided it should.
 */
export const showsMemberCount = (kind: ChannelKind): boolean => {
    switch (kind) {
        case 'self':
        case 'dm':
            return false;
        case 'group':
            return true;
    }
};

/** What "remove this room" does for a given kind. `none` means the room cannot be removed at all. */
export type ChannelRemoval = 'leave' | 'delete' | 'none';

/**
 * The single answer to "what happens when this room is removed", shared by every surface that
 * offers the action.
 *
 * **A DM always leaves — never deletes, not even for the inviter.** `channel.ownerId` points at
 * whoever sent the invite, but a 1:1 has no owner/member split: that id is a by-product of how the
 * room was created, not a permission. Re-inviting needs the room to still be there, so letting one
 * side erase it takes that away.
 *
 * That rule was already honoured on the room's own settings screen and NOT on the place's bulk
 * "remove selected rooms", which branched on place ownership alone and sent `channel.delete` at
 * whatever was checked — a DM included. Two screens answering the same question differently is the
 * shape that produced the bug, so the answer lives here and both screens read it.
 *
 * `isChannelOwner` is about THIS channel (`channel.ownerId === uid`), not about owning the place
 * the channel sits in. A place owner who is merely a member of a room inside it does not get to
 * delete that room.
 */
export const removalActionFor = (kind: ChannelKind, isChannelOwner: boolean): ChannelRemoval => {
    switch (kind) {
        case 'self':
            // Neither deletable nor leavable — a self chat has exactly one member and no exit.
            return 'none';
        case 'dm':
            return 'leave';
        case 'group':
            return isChannelOwner ? 'delete' : 'leave';
    }
};

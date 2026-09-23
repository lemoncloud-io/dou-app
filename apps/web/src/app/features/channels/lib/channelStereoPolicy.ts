import { RELAY_CLOUD_ID, isCloudWideChannel, type DomainChannel } from '@chatic/data';

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

/**
 * Which lineage a 1:1 room came from. Only meaningful once the kind is already `dm`.
 *
 * `stereo` cannot tell these apart — both are `'dm'` — and they are not the same room. A relay 1:1
 * is reached by inviting a phone number, so it has an invite behind it and can be re-opened by
 * sending another one. A cloud 1:1 is opened by naming a member directly (`channel.startDm`), so
 * there is no invite in its history and no number to send one to.
 */
export type DmLineage = 'relay' | 'cloud';

/**
 * The lineage of a 1:1 room, or `undefined` when the room is not a 1:1 (or is not loaded yet).
 *
 * **The cloud is what separates them, and `cid` is the field that says so.** It is the server's
 * own answer to "which cloud is this room in", it arrives on every read, and nothing on the client
 * derives or overwrites it.
 *
 * **This used to read `sid`, and that was wrong.** The reasoning was that a cloud 1:1 belongs to no
 * place, so a blank `sid` would mark it. Measured on dev (2026-09-23): the server assigns the room
 * a place anyway — whichever one the creator happened to be standing in — and returns it on every
 * subsequent read, so a client that blanks the field simply has it filled back in. Worse, `sid`
 * then meant two things at once ("no place" and "place not known yet"), and a room silently
 * changed lineage the moment a sync landed. `cid` cannot drift that way.
 */
export const dmLineageOf = (
    channel: Pick<DomainChannel, 'stereo' | 'cid'> | null | undefined
): DmLineage | undefined => {
    if (!channel || channelKindOf(channel.stereo) !== 'dm') return undefined;
    return channel.cid === RELAY_CLOUD_ID ? 'relay' : 'cloud';
};

/**
 * Whether this room's UI may talk about invites — the departure footer, its re-invite CTA, and the
 * `invite.list` poll that feeds them.
 *
 * Only the invite-attached parts split on lineage. Read receipts, the member list's handling of
 * somebody who left, and the join/leave system messages are about a 1:1 as such and stay as they
 * are for both lineages.
 *
 * What a cloud 1:1 should show once its peer leaves the cloud is an open product question. Until it
 * is answered this reports `false`, which leaves the room saying nothing rather than borrowing a
 * sentence written for a flow it does not have.
 */
export const hasDmInviteFlow = (channel: Pick<DomainChannel, 'stereo' | 'cid'> | null | undefined): boolean =>
    dmLineageOf(channel) === 'relay';

/**
 * Re-exported from the data layer, where the rule lives: **`sid` is not a scope key for a 1:1**.
 * A group is read within its place; a 1:1 is read across the cloud, because the place it carries
 * describes where its creator stood rather than where the conversation lives. Screens import it
 * from here so every channel rule in this module reads from one place.
 */
export { isCloudWideChannel };

/**
 * Which place's profiles name the people in this room.
 *
 * A profile is per-place — the same person has a different nick and photo in each one — so naming
 * anybody requires choosing a place first. For a room that is read within a place, that choice is
 * already made: `channel.sid` is it.
 *
 * **A cloud 1:1 is not read within a place** (see {@link isCloudWideChannel}), and the place it
 * carries is an accident of where its creator stood, so the reader's own is the only defensible
 * answer. Two consequences follow, and both are intended rather than tolerated. The same room names
 * its peer differently when opened from a different place. And two participants who share no place
 * see each other by different names — which is why no single place could have been right for both.
 *
 * Returns `null` when there is nothing to look under, which is what the profile hooks read as "do
 * not subscribe yet" — an unresolved session or an unloaded row, not an answer.
 */
export const profilePlaceOf = (
    channel: Pick<DomainChannel, 'stereo' | 'cid' | 'sid'> | null | undefined,
    activeSid: string | null | undefined
): string | null => (isCloudWideChannel(channel) ? (activeSid ?? null) : (channel?.sid ?? null));

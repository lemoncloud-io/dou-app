import type { DomainChannel } from './models';

/** The relay's cloud id. Every other cloud is a subscription one. */
export const RELAY_CLOUD_ID = 'default';

/**
 * Whether a channel is read across the whole cloud rather than within one place.
 *
 * **`sid` is not a scope key for a 1:1, and this is where that is written down.**
 *
 * A group room lives in a place: its `sid` is where it belongs, and a place-scoped read is the
 * right way to find it. A 1:1 does not work that way. The server still puts one in a place — the
 * creator's, at the moment they opened it — but that tag describes where one person happened to be
 * standing, not where the conversation lives. The other participant need not be in that place at
 * all, so a place-scoped read shows the room to one of them and hides it from the other.
 *
 * Measured on dev (2026-09-23): a 1:1's id is derived from the pair, so opening it again from a
 * different place returns the same room carrying the same original tag. There is no second room to
 * make per place, and no point at which the tag becomes right for both people.
 *
 * **The field is left exactly as the server sent it.** An earlier attempt had the client blank it
 * to mean "no place", which failed twice over: the next sync filled it back in, and an empty `sid`
 * could not be told apart from "place not known yet". Nothing here overwrites a value the server
 * owns — the client simply stops using it to decide what a reader can see.
 *
 * The relay is excluded because its 1:1s really do live in its one place, and are already listed
 * there; reading them cloud-wide as well would show them twice.
 */
export const isCloudWideChannel = (channel: Pick<DomainChannel, 'stereo' | 'cid'> | null | undefined): boolean =>
    !!channel && channel.stereo === 'dm' && channel.cid !== RELAY_CLOUD_ID;

/**
 * Whether a channel belongs in the list for `sid`.
 *
 * The place filter, plus the rule above: a room read cloud-wide is not in any place's list, however
 * its `sid` reads. Without the second half a cloud 1:1 appears twice — once under whichever place
 * its creator was in, and once in the section that exists to hold it.
 */
export const isInPlaceList = (channel: Pick<DomainChannel, 'stereo' | 'cid' | 'sid'>, sid: string): boolean =>
    channel.sid === sid && !isCloudWideChannel(channel);

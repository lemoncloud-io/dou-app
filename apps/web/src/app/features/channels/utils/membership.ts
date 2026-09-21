import type { DomainChannel, DomainJoin } from '@chatic/data';

import { pickDmPeerId } from './dmPeer';

/**
 * Whether a join row belongs to somebody who is no longer in the channel.
 *
 * `join.joined` cannot answer this on its own. The server documents the counter as
 * `0: inactive (not joined or left), 1: active (joined)` — one value for two opposite states — so a member
 * who left is indistinguishable from an invitee who never arrived. Reading `joined === 0` as
 * "invited, pending" is what put an "invite pending" badge on departed members, and it is why the settings
 * list showed them at all: their join row survives in the cache with nothing to filter on.
 *
 * `joinedNo` is the discriminator. It is the chat number the member entered at, and the server
 * windows their feed by it ("messages before this number are excluded from lookup"), so somebody who never
 * entered cannot have one. `reason` (the leave/kick reason) is checked too, so a row recording why
 * it ended counts as ended even without `joinedNo`.
 *
 * If the server omits both, this returns false and departed members stay listed, exactly as before:
 * it can only help, never make things worse. That is also why nothing badges pending invites any
 * more — see ChannelSettingsPage. Guessing wrong there was visible to users; guessing wrong here is
 * not.
 *
 * `joinedNo` is also what windows the message feed after a re-join (`isInJoinWindow`, ADR-0067), so
 * the two readings of the field stay consistent: it marks where my current membership starts.
 */
type MembershipJoin = Pick<DomainJoin, 'joined' | 'joinedNo' | 'reason'>;

export const hasLeftChannel = (join?: MembershipJoin | null): boolean =>
    !!join && join.joined === 0 && (!!join.joinedNo || !!join.reason);

/**
 * Whether a 1:1's peer is gone from the roster entirely.
 *
 * `hasLeftChannel` answers "did this join row end?" and needs a join row to read. It cannot answer
 * the case measured on 2026-09-18: when the peer leaves a DM, the server drops them from
 * `channel.memberIds` AND stops returning their join row. There is no row left to judge, so the
 * peer simply disappears — `useDmPeer` returns `null`, nothing computes "the peer left", and the
 * room stays open with a live composer for a conversation nobody is on the other end of.
 *
 * `keepLeftMembers` does not help here. It un-filters departed members from the join list; it
 * cannot restore a row the server never sent.
 *
 * **This is not a member-count heuristic.** A DM is two people by definition, so "the roster holds
 * only me" is the server's own statement that the other one is gone, not an inference from a
 * number. The count is never compared — the peer is looked for by id, exactly as `useDmPeer` does.
 *
 * Requires a HYDRATED roster, and that distinction is the whole reason this is not just
 * `!peerId`: an empty or absent `memberIds` means "not loaded yet", and treating that as departure
 * would lock the composer for a beat every time a healthy room opens cold.
 */
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

/**
 * Whether I am in this room — the gate on polling OTHER members' join rows.
 *
 * `getJoinDetail` on the server hands a join only to its owner or to a member of its channel
 * (`channel.memberIds`). A room opened without membership — a push or deep link into somebody
 * else's self-chat, a URL to a group I never joined — used to register a `join.get` for every id
 * on the roster anyway, and each one came back 403 and an error alarm on the server side.
 *
 * Two readings, either one is enough. The roster (`channel.memberIds`) is the server's own rule,
 * so it answers as soon as the channel row does. It is capped at 100 ids though, so a member of a
 * larger room may be missing from it; my own join row (`joined !== 0`, the same reading
 * `useChannelJoins` uses for the active set) covers that case once the join cache has it.
 *
 * Unknown reads as NOT a member: registering later costs a beat of stale read receipts,
 * registering wrongly costs a server alarm per member.
 */
export const isChannelMember = (
    channel: RosterChannel | null | undefined,
    myJoin: Pick<DomainJoin, 'joined'> | null | undefined,
    userId: string | null | undefined
): boolean => {
    if (!userId) return false;
    if (channel?.memberIds?.includes(userId)) return true;
    return !!myJoin && myJoin.joined !== 0;
};

/**
 * The roster cap the server applies to `memberIds`. Past it, absence from the roster proves nothing.
 */
const ROSTER_CAP = 100;

/**
 * Whether this room can be stated, from its own row, to be one I am not in.
 *
 * Distinct from `isChannelMember`, and the difference is the whole point. That one answers "may I
 * poll other members' joins", where an unknown reads as no because guessing wrong costs a server
 * alarm. This one decides whether to CLOSE a room a reader asked for, where guessing wrong throws
 * somebody out of their own conversation — so an unknown has to read as yes, keep it open.
 *
 * Needed because the server does not close it for us. Measured on dev (2026-09-21) from the account
 * that had just left a 1:1: `channel.get` and the message read both still succeed, and the room
 * renders history the reader is no longer party to. What the row DOES carry is the truth — the
 * departed member is dropped from `memberIds` — so the client can read it off the room itself,
 * without another round trip and without depending on an error arriving.
 *
 * Three conditions, each closing a way of being wrong:
 *
 * - **The roster is hydrated.** An empty or absent `memberIds` is "not loaded yet".
 * - **It is under the cap.** The server truncates at 100, so a member of a larger room can be
 *   legitimately missing from it; past the cap this declines to answer at all.
 * - **My own join row does not say otherwise.** An active join outranks the roster — that is the
 *   case the cap exists for, and it is also the one that arrives late, so it is checked rather than
 *   waited on.
 */
export const isNotMyChannel = (
    channel: Pick<DomainChannel, 'memberIds'> | null | undefined,
    myJoin: Pick<DomainJoin, 'joined'> | null | undefined,
    userId: string | null | undefined
): boolean => {
    if (!channel || !userId) return false;
    const roster = channel.memberIds;
    if (!roster?.length || roster.length >= ROSTER_CAP) return false;
    if (roster.includes(userId)) return false;
    return !myJoin || myJoin.joined === 0;
};

/**
 * Whether this is a self-chat that belongs to somebody else — a room I can never be a member of.
 *
 * A self-chat (`stereo === 'self'`, id `U:{ownerId}`) has exactly one legitimate reader, its owner.
 * Landing in another user's copy is only ever an accident (a stale push after an account switch
 * on the same device, a pasted URL), and nothing inside it can load: the join polling is refused
 * (see `isChannelMember`) and so is the message feed. Requires both ids to be known — while the
 * session identity is still resolving, or when the server omitted `ownerId`, this stays false so a
 * legitimate room is never bounced on a guess.
 */
export const isSomeoneElsesSelfChat = (
    channel: SelfChatChannel | null | undefined,
    userId: string | null | undefined
): boolean => !!channel && !!userId && channel.stereo === 'self' && !!channel.ownerId && channel.ownerId !== userId;

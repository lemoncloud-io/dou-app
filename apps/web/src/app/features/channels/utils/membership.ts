import type { DomainChannel, DomainJoin } from '@chatic/data';

/**
 * Whether a join row belongs to somebody who is no longer in the channel.
 *
 * `join.joined` cannot answer this on its own. The server documents the counter as
 * `0: 비활성 (미참여 or 탈퇴), 1: 활성 (참여 중)` — one value for two opposite states — so a member
 * who left is indistinguishable from an invitee who never arrived. Reading `joined === 0` as
 * "invited, pending" is what put a 초대 대기 badge on departed members, and it is why the settings
 * list showed them at all: their join row survives in the cache with nothing to filter on.
 *
 * `joinedNo` is the discriminator. It is the chat number the member entered at, and the server
 * windows their feed by it ("이 번호 이전의 메시지는 조회 대상에서 제외"), so somebody who never
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

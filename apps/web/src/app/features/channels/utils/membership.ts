import type { DomainJoin } from '@chatic/data';

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
 * NOT VERIFIED against a live payload — no other code in the repo reads either field. If the server
 * omits both, this returns false and departed members stay listed, exactly as before: it can only
 * help, never make things worse. That is also why nothing badges pending invites any more — see
 * ChannelSettingsPage. Guessing wrong there was visible to users; guessing wrong here is not.
 */
type MembershipJoin = Pick<DomainJoin, 'joined'> & { joinedNo?: number; reason?: string };

export const hasLeftChannel = (join?: MembershipJoin | null): boolean =>
    !!join && join.joined === 0 && (!!join.joinedNo || !!join.reason);

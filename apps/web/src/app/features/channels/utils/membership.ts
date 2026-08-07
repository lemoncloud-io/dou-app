import type { DomainJoin } from '@chatic/data';

/**
 * Telling "invited, hasn't come in yet" apart from "was here, left".
 *
 * `join.joined` cannot do it alone. The server documents the counter as
 * `0: 비활성 (미참여 or 탈퇴), 1: 활성 (참여 중)` — one value for two opposite states — so a member
 * who left reads exactly like a pending invitee, which is how the settings list ended up badging
 * departed members as "초대 대기".
 *
 * `joinedNo` is the discriminator: it is the chat number the member entered at, and the server
 * relies on it to window their feed ("이 번호 이전의 메시지는 조회 대상에서 제외"). Somebody who
 * never entered cannot have one. `reason` (the leave/kick reason) is checked too, so a row that
 * records why it ended is treated as ended even if `joinedNo` is missing.
 */
type MembershipJoin = Pick<DomainJoin, 'joined'> & { joinedNo?: number; reason?: string };

/** Invited, never entered — the only case the "초대 대기" badge is for. */
export const isPendingInvite = (join?: MembershipJoin | null): boolean =>
    !!join && join.joined === 0 && !join.joinedNo && !join.reason;

/** Was a member and is not any more (left or kicked). Such rows do not belong in a member list. */
export const hasLeftChannel = (join?: MembershipJoin | null): boolean =>
    !!join && join.joined === 0 && (!!join.joinedNo || !!join.reason);

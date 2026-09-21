import { hasLeftChannel, isChannelMember, isDmPeerMissing, isNotMyChannel, isSomeoneElsesSelfChat } from './membership';

// The server defines `joined` as `0: inactive (not yet joined or left), 1: active` — one value
// points to two opposite states. So looking only at `joined === 0` made someone who left look
// like a pending invitee (a bug that actually happened).
const join = (over: Record<string, unknown> = {}) => ({ joined: 0, ...over }) as never;

describe('hasLeftChannel — 나간 멤버 판별', () => {
    it('입장 번호가 있는데 비활성이면 나간 것이다', () => {
        expect(hasLeftChannel(join({ joinedNo: 42 }))).toBe(true);
    });

    it('사유가 남아 있으면 입장 번호가 없어도 나간 것으로 본다', () => {
        expect(hasLeftChannel(join({ reason: 'kicked' }))).toBe(true);
    });

    it('참여 중인 멤버는 나간 것이 아니다', () => {
        expect(hasLeftChannel(join({ joined: 1, joinedNo: 42 }))).toBe(false);
    });

    // Someone who's only been invited and hasn't joined must not be removed from the list — this
    // is the point where they're distinguished from someone who left.
    it('초대 대기자는 나간 것이 아니다', () => {
        expect(hasLeftChannel(join())).toBe(false);
    });

    // The case where the server sends neither field. With no basis to decide, remove no one —
    // that's the same behavior as before the fix, and it's better than dropping a perfectly
    // fine member from the list.
    it('판별 근거가 없으면 아무도 나간 것으로 보지 않는다', () => {
        expect(hasLeftChannel(join())).toBe(false);
        expect(hasLeftChannel(undefined)).toBe(false);
        expect(hasLeftChannel(null)).toBe(false);
    });
});

// The server's `getJoinDetail` only returns a join to its owner or to a member listed in
// `channel.memberIds`. The room's roster polling must pass this check — failing it fires a 403
// alarm for every member.
describe('isChannelMember — 이 방의 멤버인가', () => {
    it('로스터(memberIds)에 내가 있으면 멤버다', () => {
        expect(isChannelMember({ memberIds: ['u1', 'me'] }, null, 'me')).toBe(true);
    });

    // memberIds only carries up to 100 people. In a large room, I'm a member if my join row is
    // active even when I'm missing from it.
    it('로스터에 없어도 내 join 행이 활성이면 멤버다', () => {
        expect(isChannelMember({ memberIds: ['u1'] }, { joined: 1 }, 'me')).toBe(true);
        // A row that omits `joined` is read as active, the same way useChannelJoins reads it.
        expect(isChannelMember({ memberIds: [] }, {}, 'me')).toBe(true);
    });

    it('로스터에 없고 join 행도 비활성(0)이면 멤버가 아니다', () => {
        expect(isChannelMember({ memberIds: ['u1'] }, { joined: 0 }, 'me')).toBe(false);
    });

    // The shape of the incident where 1000891 ended up in someone else's self-chat `U:1000003`:
    // the roster has only the owner, and I have no join row.
    it('남의 방(로스터에 나 없음, 내 join 없음)은 멤버가 아니다', () => {
        expect(isChannelMember({ memberIds: ['1000003'] }, null, '1000891')).toBe(false);
    });

    // Don't register when it's unknown — registering late delays the read marker by a beat, and
    // registering wrongly fires a server alarm.
    it('채널 행·내 id가 아직 없으면 멤버가 아니다', () => {
        expect(isChannelMember(null, null, 'me')).toBe(false);
        expect(isChannelMember({ memberIds: ['me'] }, { joined: 1 }, undefined)).toBe(false);
        expect(isChannelMember({}, null, 'me')).toBe(false);
    });
});

// A self-chat can only be read by its single owner. This check is what kicks a user straight
// back out of the room when a push for an old account arrives on a device that switched
// accounts, landing them in someone else's self-chat by accident.
describe('isSomeoneElsesSelfChat — 남의 셀프챗인가', () => {
    it('stereo가 self이고 주인이 나와 다르면 남의 것이다', () => {
        expect(isSomeoneElsesSelfChat({ stereo: 'self', ownerId: '1000003' }, '1000891')).toBe(true);
    });

    it('내 셀프챗은 남의 것이 아니다', () => {
        expect(isSomeoneElsesSelfChat({ stereo: 'self', ownerId: 'me' }, 'me')).toBe(false);
    });

    it('셀프챗이 아닌 방은 주인이 달라도 해당 없다', () => {
        expect(isSomeoneElsesSelfChat({ stereo: 'dm', ownerId: 'u1' }, 'me')).toBe(false);
        expect(isSomeoneElsesSelfChat({ ownerId: 'u1' }, 'me')).toBe(false);
    });

    // Don't kick anyone out if either id is unknown — a normal room must not be bounced at the
    // moment session identity hasn't settled yet.
    it('내 id나 주인이 없으면 판정하지 않는다', () => {
        expect(isSomeoneElsesSelfChat({ stereo: 'self', ownerId: 'u1' }, undefined)).toBe(false);
        expect(isSomeoneElsesSelfChat({ stereo: 'self' }, 'me')).toBe(false);
        expect(isSomeoneElsesSelfChat(null, 'me')).toBe(false);
    });
});

describe('isDmPeerMissing', () => {
    const dm = (memberIds?: string[]) => ({ stereo: 'dm' as const, memberIds });

    // The measured shape of a real departure (2026-09-18): the server drops the peer from the
    // roster and stops sending their join row, so there is nothing for `hasLeftChannel` to read.
    it('reports a peer who is gone from the roster', () => {
        expect(isDmPeerMissing(dm(['me']), 'me')).toBe(true);
    });

    it('says nothing while the peer is still there', () => {
        expect(isDmPeerMissing(dm(['me', 'peer']), 'me')).toBe(false);
    });

    // An unhydrated roster must not read as departure — that would lock the composer for a beat
    // every time a healthy room opens cold.
    it.each([undefined, []])('treats an unhydrated roster (%p) as unknown, not departed', roster => {
        expect(isDmPeerMissing(dm(roster), 'me')).toBe(false);
    });

    it('says nothing without my own id', () => {
        expect(isDmPeerMissing(dm(['me']), undefined)).toBe(false);
        expect(isDmPeerMissing(dm(['me']), null)).toBe(false);
    });

    // Only a 1:1 is two-people-by-definition; a one-member group is an ordinary state.
    it.each(['self', 'private', 'public', '', undefined] as const)('ignores stereo %p', stereo => {
        expect(isDmPeerMissing({ stereo, memberIds: ['me'] }, 'me')).toBe(false);
    });

    it('ignores a null channel', () => {
        expect(isDmPeerMissing(null, 'me')).toBe(false);
        expect(isDmPeerMissing(undefined, 'me')).toBe(false);
    });

    // The server keeps serving a room to somebody who left it, so the row has to be read as the
    // statement it is. Wrong in the closing direction throws a member out of their own room, so
    // every unknown here reads as "keep it open".
    describe('isNotMyChannel', () => {
        const dm = (memberIds?: string[]) => ({ stereo: 'dm' as const, memberIds });

        it('명단이 있고 내가 없으면 내 방이 아니다', () => {
            expect(isNotMyChannel(dm(['other']), null, 'me')).toBe(true);
        });

        it('명단에 내가 있으면 묻지 않는다', () => {
            expect(isNotMyChannel(dm(['me', 'other']), null, 'me')).toBe(false);
        });

        it('명단이 안 왔으면 답하지 않는다', () => {
            expect(isNotMyChannel(dm([]), null, 'me')).toBe(false);
            expect(isNotMyChannel(dm(undefined), null, 'me')).toBe(false);
        });

        // A group roster is the one the server truncates at 100, so absence from it is not
        // evidence. Rather than reason about when it is complete, this declines to answer.
        it('그룹은 답하지 않는다 — 명단이 잘릴 수 있는 쪽이다', () => {
            expect(isNotMyChannel({ stereo: 'private', memberIds: ['other'] }, null, 'me')).toBe(false);
            expect(isNotMyChannel({ stereo: '', memberIds: ['other'] }, null, 'me')).toBe(false);
            expect(isNotMyChannel({ stereo: 'self', memberIds: ['other'] }, null, 'me')).toBe(false);
        });

        // The reading that arrives late, so it is checked rather than waited on.
        it('살아 있는 내 join 행이 명단을 이긴다', () => {
            expect(isNotMyChannel(dm(['other']), { joined: 1 }, 'me')).toBe(false);
        });

        it('끝난 join 행은 명단을 뒤집지 않는다', () => {
            expect(isNotMyChannel(dm(['other']), { joined: 0 }, 'me')).toBe(true);
        });

        it('신원을 모르면 답하지 않는다', () => {
            expect(isNotMyChannel(dm(['other']), null, null)).toBe(false);
            expect(isNotMyChannel(null, null, 'me')).toBe(false);
        });
    });
});

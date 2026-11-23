import { hasLeftChannel, isChannelMember, isDmPeerMissing, isNotMyChannel, isSomeoneElsesSelfChat } from './membership';

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

    it('초대 대기자는 나간 것이 아니다', () => {
        expect(hasLeftChannel(join())).toBe(false);
    });

    it('판별 근거가 없으면 아무도 나간 것으로 보지 않는다', () => {
        expect(hasLeftChannel(join())).toBe(false);
        expect(hasLeftChannel(undefined)).toBe(false);
        expect(hasLeftChannel(null)).toBe(false);
    });
});

describe('isChannelMember — 이 방의 멤버인가', () => {
    it('로스터(memberIds)에 내가 있으면 멤버다', () => {
        expect(isChannelMember({ memberIds: ['u1', 'me'] }, null, 'me')).toBe(true);
    });

    it('로스터에 없어도 내 join 행이 활성이면 멤버다', () => {
        expect(isChannelMember({ memberIds: ['u1'] }, { joined: 1 }, 'me')).toBe(true);
        const joinWithoutJoined = {} as unknown as NonNullable<Parameters<typeof isChannelMember>[1]>;
        expect(isChannelMember({ memberIds: [] }, joinWithoutJoined, 'me')).toBe(true);
    });

    it('로스터에 없고 join 행도 비활성(0)이면 멤버가 아니다', () => {
        expect(isChannelMember({ memberIds: ['u1'] }, { joined: 0 }, 'me')).toBe(false);
    });

    it('남의 방(로스터에 나 없음, 내 join 없음)은 멤버가 아니다', () => {
        expect(isChannelMember({ memberIds: ['1000003'] }, null, '1000891')).toBe(false);
    });

    it('채널 행·내 id가 아직 없으면 멤버가 아니다', () => {
        expect(isChannelMember(null, null, 'me')).toBe(false);
        expect(isChannelMember({ memberIds: ['me'] }, { joined: 1 }, undefined)).toBe(false);
        expect(isChannelMember({}, null, 'me')).toBe(false);
    });
});

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

    it('내 id나 주인이 없으면 판정하지 않는다', () => {
        expect(isSomeoneElsesSelfChat({ stereo: 'self', ownerId: 'u1' }, undefined)).toBe(false);
        expect(isSomeoneElsesSelfChat({ stereo: 'self' }, 'me')).toBe(false);
        expect(isSomeoneElsesSelfChat(null, 'me')).toBe(false);
    });
});

describe('isDmPeerMissing', () => {
    const dm = (memberIds?: string[]) => ({ stereo: 'dm' as const, memberIds });

    it('reports a peer who is gone from the roster', () => {
        expect(isDmPeerMissing(dm(['me']), 'me')).toBe(true);
    });

    it('says nothing while the peer is still there', () => {
        expect(isDmPeerMissing(dm(['me', 'peer']), 'me')).toBe(false);
    });

    it.each([undefined, []])('treats an unhydrated roster (%p) as unknown, not departed', roster => {
        expect(isDmPeerMissing(dm(roster), 'me')).toBe(false);
    });

    it('says nothing without my own id', () => {
        expect(isDmPeerMissing(dm(['me']), undefined)).toBe(false);
        expect(isDmPeerMissing(dm(['me']), null)).toBe(false);
    });

    it.each(['self', 'private', 'public', '', undefined] as const)('ignores stereo %p', stereo => {
        expect(isDmPeerMissing({ stereo, memberIds: ['me'] }, 'me')).toBe(false);
    });

    it('ignores a null channel', () => {
        expect(isDmPeerMissing(null, 'me')).toBe(false);
        expect(isDmPeerMissing(undefined, 'me')).toBe(false);
    });

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

        it('그룹은 답하지 않는다 — 명단이 잘릴 수 있는 쪽이다', () => {
            expect(isNotMyChannel({ stereo: 'private', memberIds: ['other'] }, null, 'me')).toBe(false);
            expect(isNotMyChannel({ stereo: '', memberIds: ['other'] }, null, 'me')).toBe(false);
            expect(isNotMyChannel({ stereo: 'self', memberIds: ['other'] }, null, 'me')).toBe(false);
        });

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

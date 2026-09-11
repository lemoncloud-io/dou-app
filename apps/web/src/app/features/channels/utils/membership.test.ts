import { hasLeftChannel, isChannelMember, isSomeoneElsesSelfChat } from './membership';

// 서버는 `joined`를 `0: 비활성 (미참여 or 탈퇴), 1: 활성`으로 정의한다 — 한 값이 정반대 두 상태를
// 가리킨다. 그래서 `joined === 0`만 보면 나간 사람이 초대 대기자로 보였다(실제 발생한 버그).
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

    // 초대만 되고 안 들어온 사람은 목록에서 지우면 안 된다 — 나간 사람과 구분되는 지점.
    it('초대 대기자는 나간 것이 아니다', () => {
        expect(hasLeftChannel(join())).toBe(false);
    });

    // 서버가 두 필드를 다 안 보내는 경우. 판별할 근거가 없으면 아무도 지우지 않는다 —
    // 고치기 전과 같은 동작이고, 멀쩡한 멤버를 목록에서 날리는 것보다 낫다.
    it('판별 근거가 없으면 아무도 나간 것으로 보지 않는다', () => {
        expect(hasLeftChannel(join())).toBe(false);
        expect(hasLeftChannel(undefined)).toBe(false);
        expect(hasLeftChannel(null)).toBe(false);
    });
});

// 서버 `getJoinDetail`은 join을 그 주인 또는 `channel.memberIds`의 멤버에게만 준다. 방의 로스터
// 폴링은 이 판정을 통과해야 한다 — 통과 못 하면 멤버 수만큼 403 알람이 난다.
describe('isChannelMember — 이 방의 멤버인가', () => {
    it('로스터(memberIds)에 내가 있으면 멤버다', () => {
        expect(isChannelMember({ memberIds: ['u1', 'me'] }, null, 'me')).toBe(true);
    });

    // memberIds는 100명까지만 실린다. 큰 방에서 내가 빠져 있어도 내 활성 join 행이 있으면 멤버다.
    it('로스터에 없어도 내 join 행이 활성이면 멤버다', () => {
        expect(isChannelMember({ memberIds: ['u1'] }, { joined: 1 }, 'me')).toBe(true);
        // `joined`를 안 보내는 행은 useChannelJoins와 같은 읽기로 활성으로 본다.
        expect(isChannelMember({ memberIds: [] }, {}, 'me')).toBe(true);
    });

    it('로스터에 없고 join 행도 비활성(0)이면 멤버가 아니다', () => {
        expect(isChannelMember({ memberIds: ['u1'] }, { joined: 0 }, 'me')).toBe(false);
    });

    // 남의 셀프챗 `U:1000003`에 1000891이 들어온 사건의 형태: 로스터는 주인뿐, 내 join은 없다.
    it('남의 방(로스터에 나 없음, 내 join 없음)은 멤버가 아니다', () => {
        expect(isChannelMember({ memberIds: ['1000003'] }, null, '1000891')).toBe(false);
    });

    // 모르면 등록하지 않는다 — 늦게 등록하면 읽음 표시가 한 박자 늦고, 잘못 등록하면 서버 알람이다.
    it('채널 행·내 id가 아직 없으면 멤버가 아니다', () => {
        expect(isChannelMember(null, null, 'me')).toBe(false);
        expect(isChannelMember({ memberIds: ['me'] }, { joined: 1 }, undefined)).toBe(false);
        expect(isChannelMember({}, null, 'me')).toBe(false);
    });
});

// 셀프챗은 주인 한 사람만 읽을 수 있다. 계정을 바꾼 기기에 옛 계정의 푸시가 와서 남의 셀프챗으로
// 들어오는 사고를 방에서 바로 내보내기 위한 판정.
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

    // 두 id 중 하나라도 모르면 내보내지 않는다 — 세션 identity가 아직 안 잡힌 순간에 정상 방을
    // 튕겨내면 안 된다.
    it('내 id나 주인이 없으면 판정하지 않는다', () => {
        expect(isSomeoneElsesSelfChat({ stereo: 'self', ownerId: 'u1' }, undefined)).toBe(false);
        expect(isSomeoneElsesSelfChat({ stereo: 'self' }, 'me')).toBe(false);
        expect(isSomeoneElsesSelfChat(null, 'me')).toBe(false);
    });
});

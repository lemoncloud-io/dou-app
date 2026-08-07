import { hasLeftChannel } from './membership';

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

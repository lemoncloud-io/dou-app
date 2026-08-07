import { hasLeftChannel, isPendingInvite } from './membership';

// 서버는 `joined`를 `0: 비활성 (미참여 or 탈퇴), 1: 활성`으로 정의한다 — 한 값이 정반대 두 상태를
// 가리킨다. 그래서 `joined === 0`만 보면 나간 사람이 초대 대기자로 보인다(실제 발생한 버그).
const join = (over: Record<string, unknown> = {}) => ({ joined: 0, ...over }) as never;

describe('membership — 초대 대기와 탈퇴 구분', () => {
    describe('isPendingInvite', () => {
        it('초대만 되고 한 번도 안 들어온 사람이다', () => {
            expect(isPendingInvite(join())).toBe(true);
        });

        it('참여 중인 멤버는 아니다', () => {
            expect(isPendingInvite(join({ joined: 1 }))).toBe(false);
        });

        // 이 두 건이 버그의 본체다.
        it('들어왔다 나간 사람은 아니다 (joinedNo가 있다)', () => {
            expect(isPendingInvite(join({ joinedNo: 42 }))).toBe(false);
        });

        it('강퇴된 사람도 아니다 (reason이 있다)', () => {
            expect(isPendingInvite(join({ reason: 'kicked' }))).toBe(false);
        });

        it('join 행 자체가 없으면 판단하지 않는다', () => {
            expect(isPendingInvite(undefined)).toBe(false);
            expect(isPendingInvite(null)).toBe(false);
        });
    });

    describe('hasLeftChannel', () => {
        it('입장 번호가 있는데 비활성이면 나간 것이다', () => {
            expect(hasLeftChannel(join({ joinedNo: 42 }))).toBe(true);
        });

        it('사유가 남아 있으면 입장 번호가 없어도 나간 것으로 본다', () => {
            expect(hasLeftChannel(join({ reason: 'left' }))).toBe(true);
        });

        it('초대 대기자는 나간 것이 아니다 — 목록에서 지우면 안 된다', () => {
            expect(hasLeftChannel(join())).toBe(false);
        });

        it('참여 중인 멤버는 나간 것이 아니다', () => {
            expect(hasLeftChannel(join({ joined: 1, joinedNo: 42 }))).toBe(false);
        });

        // 둘은 서로 배타적이어야 한다: 같은 행이 목록에서 빠지면서 동시에 초대 대기일 수 없다.
        it.each([[{}], [{ joinedNo: 42 }], [{ reason: 'kicked' }], [{ joined: 1 }]])(
            '%o 는 두 술어를 동시에 만족하지 않는다',
            over => {
                expect(isPendingInvite(join(over)) && hasLeftChannel(join(over))).toBe(false);
            }
        );
    });
});

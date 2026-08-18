import { createSyncPlans } from './plans';

// createSyncPlans는 런타임 의존을 콜백 안에서 lazy로 읽으므로(파일 상단 주석), plan 생성과
// onConnected 훅 호출만으로는 소켓/데이터 런타임이 필요 없다 — 이 계약 테스트가 성립하는 이유.
describe('createSyncPlans — 재연결 스냅샷 유지 (ADR-0059)', () => {
    it.each(['channel', 'place', 'profile', 'join'] as const)(
        '%s plan은 onConnected에서 스냅샷을 리셋하지 않는다',
        domain => {
            const plan = createSyncPlans().find(candidate => candidate.domain === domain);
            expect(plan).toBeDefined();

            const writeSnapshot = jest.fn();
            // 리셋하는 기본 구현은 여기서 writeSnapshot(target, undefined)를 부른다 — 그 호출이
            // 없어야 재연결(포그라운드 복귀)마다의 전 타깃 동일-데이터 쓰기 연쇄가 사라진다.
            plan?.onConnected?.({ type: domain, id: 't-1' }, { writeSnapshot } as never);

            expect(writeSnapshot).not.toHaveBeenCalled();
        }
    );
});

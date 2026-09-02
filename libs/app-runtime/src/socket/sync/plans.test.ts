// plans.ts → data/runtime.ts → DataManager.ts → httpFactory.ts가 `@chatic/web-core`를 값으로
// import한다(webTransport). 그 모듈은 `import.meta.env`를 로드 시점에 읽어 ts-jest(CJS)가
// 파싱하지 못하므로, 이 테스트가 실제로 쓰지 않는 의존이어도 목으로 끊어야 한다 — 다른
// app-runtime 테스트(HttpManager.test.ts 등)와 같은 패턴.
import { createSyncPlans } from './plans';

jest.mock('../../session', () => new Proxy({}, { get: () => jest.fn() }));
// 런타임 접근자만 끊는다 — `toDomainChat`은 진짜를 써야 `hidden`이 매핑을 타고 살아남는지 볼 수 있다.
// `jest.mock`은 파일 최상단에서만 호이스팅되므로 describe 안이 아니라 여기에 둔다. 위의 스냅샷
// 계약 테스트는 이 접근자들을 부르지 않으므로 영향받지 않는다.
const mockCacheWrite = jest.fn();
const mockBoundCid = { current: 'cloud-1' };
jest.mock('../../data/runtime', () => ({
    getDataManager: () => ({ getContext: () => ({ cid: 'cloud-1', uid: 'user-1' }) }),
    getRepositories: () => ({ chat: { cacheWrite: mockCacheWrite, cacheWriteMany: jest.fn() } }),
}));
jest.mock('../runtime', () => ({ getSocketManager: () => ({ getBoundCid: () => mockBoundCid.current }) }));
// `@chatic/web-config` is the sole `import.meta` holder (ADR-0070 결정 6); ts-jest's CommonJS
// transform cannot parse it, and HttpManager pulls it in transitively.
jest.mock('@chatic/web-config', () => new Proxy({}, { get: () => jest.fn() }));

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

/**
 * 남이 한 편집·삭제의 반영 경로. sockets-lib 0.5.1이 열어준 `onUpdate`가 배선돼 있지 않으면 변경은
 * 어디에도 닿지 않고 다음 `chat.feed` 재조회에서야 수렴한다 — 실패가 조용해서 테스트로 고정한다.
 *
 * 런타임 접근자만 목으로 끊고 `toDomainChat`은 진짜를 쓴다: 여기서 확인하고 싶은 것 하나가
 * `hidden`이 매핑을 타고 캐시 행까지 살아남는가이기 때문이다.
 */
describe('createSyncPlans — chat 변경 반영 (sockets-lib 0.5.1 onUpdate)', () => {
    /**
     * `onUpdate`는 plan의 공개 훅이 아니라 생성자 옵션이다 — plan이 내부에서(이미 해소된 chatNo에
     * payload가 다시 오면) 부른다. 그래서 호출 대신 **우리가 넘긴 콜백**을 꺼내 검증한다. 이것이
     * 실제 이음매이고, 배선 누락(옵션 자체가 없음)도 여기서 잡힌다.
     */
    const chatOnUpdate = () => {
        const plan = createSyncPlans().find(candidate => candidate.domain === 'chat') as unknown as {
            options?: { onUpdate?: (target: unknown, changed: unknown, snapshot: unknown) => void };
        };
        return plan?.options?.onUpdate;
    };

    beforeEach(() => {
        mockCacheWrite.mockClear();
        mockBoundCid.current = 'cloud-1';
    });

    it('배선돼 있다 — 없으면 변경이 다음 chat.feed까지 반영되지 않는다', () => {
        expect(chatOnUpdate()).toBeDefined();
    });

    it('편집은 바뀐 메시지를 그대로 캐시에 쓴다', () => {
        chatOnUpdate()?.(
            { type: 'chat', id: 'ch-1' },
            { id: 'ch-1:7', channelId: 'ch-1', chatNo: 7, content: '고친 내용' },
            {}
        );

        expect(mockCacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'ch-1:7', content: '고친 내용', cid: 'cloud-1' })
        );
    });

    it('삭제는 행을 지우지 않고 hidden으로 쓴다 — deleteChat과 같은 상태로 수렴한다', () => {
        chatOnUpdate()?.(
            { type: 'chat', id: 'ch-1' },
            { id: 'ch-1:7', channelId: 'ch-1', chatNo: 7, hidden: true },
            {}
        );

        // 지우면 다음 sync에 행이 되살아나 화면이 같은 메시지를 없음 → tombstone으로 두 번 보여준다.
        expect(mockCacheWrite).toHaveBeenCalledWith(expect.objectContaining({ id: 'ch-1:7', hidden: true }));
    });

    it('나가는 클라우드의 프레임은 버린다 — onApply와 같은 가드', () => {
        // 전환 낙관 창: 캐시 cid는 이미 뒤집혔는데 소켓은 아직 옛 클라우드에 붙어 있다.
        mockBoundCid.current = 'cloud-0';

        chatOnUpdate()?.(
            { type: 'chat', id: 'ch-1' },
            { id: 'ch-1:7', channelId: 'ch-1', chatNo: 7, hidden: true },
            {}
        );

        expect(mockCacheWrite).not.toHaveBeenCalled();
    });
});

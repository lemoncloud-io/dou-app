// plans.ts → data/runtime.ts → DataManager.ts → httpFactory.ts가 `@chatic/http`의 transport를
// 값으로 import한다(webTransport). 그 경로가 예전엔 `@chatic/web-config`(import.meta 홀더,
// ts-jest CJS 파싱 불가)로 이어졌지만 이제는 `@chatic/config`(import.meta 0)로 이어져 파싱은
// 더 이상 문제가 아니다 — 그래도 이 테스트가 실제로 쓰지 않는 세션 의존을 끊어 격리하는 목은
// 그대로 둔다.
import { logger } from '@chatic/bridges';

import { createSyncPlans } from './plans';

jest.mock('../../session', () => new Proxy({}, { get: () => jest.fn() }));
// 데이터 런타임 접근자만 끊는다 — `toDomainChat`은 진짜를 써야 `hidden`이 매핑을 타고 살아남는지
// 볼 수 있다. 소켓 런타임은 목이 필요 없다: 바인딩된 클라우드는 `createSyncPlans`의 인자로 들어온다.
// `jest.mock`은 파일 최상단에서만 호이스팅되므로 describe 안이 아니라 여기에 둔다. 위의 스냅샷
// 계약 테스트는 이 접근자들을 부르지 않으므로 영향받지 않는다.
//
// 등록은 모듈당 **한 번**이다. 같은 모듈에 두 번 등록하면 뒤엣것이 조용히 이기므로, 스위트별로
// 답을 갈아끼워야 하는 값은 팩토리가 읽는 홀더에 둔다 — 그게 이 파일이 두 스위트를 함께 담는 방법이다.
const mockCacheWrite = jest.fn();
const mockBoundCid: { current: string | null } = { current: 'cloud-1' };
const mockDataContext: { current: { cid: string; uid?: string } } = { current: { cid: 'cloud-1', uid: 'user-1' } };
/** `null`이면 chat 변경 스위트의 기본 리포지토리를 쓴다. */
const mockRepositories: { current: Record<string, unknown> | null } = { current: null };
jest.mock('../../data/runtime', () => ({
    getDataManager: () => ({ getContext: () => mockDataContext.current }),
    getRepositories: () =>
        mockRepositories.current ?? { chat: { cacheWrite: mockCacheWrite, cacheWriteMany: jest.fn() } },
}));
// createSyncPlans는 런타임 의존을 콜백 안에서 lazy로 읽으므로(파일 상단 주석), plan 생성과
// onConnected 훅 호출만으로는 소켓/데이터 런타임이 필요 없다 — 이 계약 테스트가 성립하는 이유.
describe('createSyncPlans — 재연결 스냅샷 유지 (ADR-0059)', () => {
    it.each(['channel', 'place', 'profile', 'join'] as const)(
        '%s plan은 onConnected에서 스냅샷을 리셋하지 않는다',
        domain => {
            const plan = createSyncPlans(() => mockBoundCid.current).find(candidate => candidate.domain === domain);
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
        const plan = createSyncPlans(() => mockBoundCid.current).find(
            candidate => candidate.domain === 'chat'
        ) as unknown as {
            options?: { onUpdate?: (target: unknown, changed: unknown, snapshot: unknown) => void };
        };
        return plan?.options?.onUpdate;
    };

    beforeEach(() => {
        mockCacheWrite.mockClear();
        mockBoundCid.current = 'cloud-1';
        mockDataContext.current = { cid: 'cloud-1', uid: 'user-1' };
        mockRepositories.current = null;
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

describe('join plan onRemove — 퇴장한 방의 메시지 캐시 정리 (ADR-0067)', () => {
    // onRemove는 plan 생성자 옵션으로만 들어가고 lib이 public으로 노출하지 않는다. 여기서 검증하려는
    // 것은 lib의 디스패치가 아니라 우리가 넘긴 콜백의 판단이므로, 그 콜백을 직접 꺼내 부른다.
    const onRemoveOf = (uid: string | undefined, boundCid: string | null) => {
        const cacheDelete = jest.fn();
        const cacheClearByChannelId = jest.fn();
        mockRepositories.current = { join: { cacheDelete }, chat: { cacheClearByChannelId } };
        mockDataContext.current = { cid: 'cloud-a', uid };
        mockBoundCid.current = boundCid;

        const plan = createSyncPlans(() => mockBoundCid.current).find(candidate => candidate.domain === 'join');
        const onRemove = (plan as unknown as { options: { onRemove: (target: { id: string }) => void } }).options
            .onRemove;
        return { onRemove, cacheDelete, cacheClearByChannelId };
    };

    it('내 join이 사라지면 그 채널의 chat 캐시를 비운다', () => {
        const { onRemove, cacheDelete, cacheClearByChannelId } = onRemoveOf('me', 'cloud-a');

        onRemove({ id: 'ch-1@me' });

        expect(cacheDelete).toHaveBeenCalledWith('ch-1@me');
        expect(cacheClearByChannelId).toHaveBeenCalledWith('ch-1');
    });

    it('다른 멤버의 join이 사라지면 내 chat 캐시는 건드리지 않는다', () => {
        const { onRemove, cacheDelete, cacheClearByChannelId } = onRemoveOf('me', 'cloud-a');

        onRemove({ id: 'ch-1@someone-else' });

        expect(cacheDelete).toHaveBeenCalledWith('ch-1@someone-else');
        expect(cacheClearByChannelId).not.toHaveBeenCalled();
    });

    it('소켓이 다른 클라우드에 묶여 있으면 비우지 않는다', () => {
        // 메시지 삭제는 되돌릴 수 없다 — 자기 클라우드보다 오래 산 소켓의 프레임이 현재 클라우드의
        // 파티션을 겨누게 두면 안 된다. 툼스톤은 기존 동작대로 남긴다.
        const { onRemove, cacheDelete, cacheClearByChannelId } = onRemoveOf('me', 'cloud-b');

        onRemove({ id: 'ch-1@me' });

        expect(cacheDelete).toHaveBeenCalledWith('ch-1@me');
        expect(cacheClearByChannelId).not.toHaveBeenCalled();
    });

    it('합성 id가 아니면 아무것도 비우지 않는다', () => {
        const { onRemove, cacheClearByChannelId } = onRemoveOf('me', 'cloud-a');

        onRemove({ id: 'not-a-composite-id' });

        expect(cacheClearByChannelId).not.toHaveBeenCalled();
    });
});

/**
 * 스케줄러가 타깃을 영구 정지시키면 lib의 plan이 `onStopped`에서 우리 `onRemove`를 부른다 —
 * 즉 **정지가 곧 삭제다**. 그 삭제에는 원래 트리거가 있었고(위 스위트) 삭제를 부른 이유에는
 * 없었다.
 *
 * `@chatic/bridges`를 모듈로 목하지 않고 실물에 spy를 건다. 부분 목(`{ logger: { error } }`)은
 * 이 트랙에서 세 번 다른 스위트를 깨뜨렸다 — 같은 모듈을 간접 소비하는 쪽이 나머지 export를
 * 잃기 때문이다. spy는 그 위험이 없다.
 */
describe('plan onStopped — 정지를 삭제 전에 남긴다', () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation();

    beforeEach(() => {
        errorSpy.mockClear();
        mockRepositories.current = {
            channel: { cacheDelete: jest.fn() },
            place: { cacheDelete: jest.fn() },
            profile: { cacheDelete: jest.fn() },
            join: { cacheDelete: jest.fn() },
            chat: { cacheClearByChannelId: jest.fn() },
        };
        mockDataContext.current = { cid: 'cloud-a', uid: 'me' };
        mockBoundCid.current = 'cloud-a';
    });

    afterAll(() => errorSpy.mockRestore());

    const planOf = (domain: string) =>
        createSyncPlans(() => mockBoundCid.current).find(candidate => candidate.domain === domain);

    /** lib의 onStopped는 스냅샷을 읽어 onRemove로 넘긴다 — 최소한 그것만 있으면 된다. */
    const CTX = { readSnapshot: () => undefined } as never;

    const FAILURE = {
        target: { type: 'join' },
        error: new Error('404 NOT FOUND'),
        kind: 'gone' as const,
        failures: 2,
        goneStreak: 2,
    };

    it.each(['channel', 'place', 'profile', 'chat', 'join'])('%s plan이 정지를 error로 남긴다', domain => {
        planOf(domain)?.onStopped?.({ type: domain, id: 't-1' } as never, FAILURE as never, CTX);

        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls[0][0]).toBe('SYNC');
        expect(errorSpy.mock.calls[0][1]).toContain(domain);
    });

    // 이 둘이 없으면 "서버가 404를 두 번 줬다"와 "정말 탈퇴됐다"를 밖에서 구분할 수 없다.
    it('정지 사유와 연속 실패 수를 함께 싣는다', () => {
        planOf('join')?.onStopped?.({ type: 'join', id: 'ch-1@me' } as never, FAILURE as never, CTX);

        const options = errorSpy.mock.calls[0][2] as { error: unknown; data: Record<string, unknown> };
        expect(options.error).toBe(FAILURE.error);
        expect(options.data).toMatchObject({ domain: 'join', kind: 'gone', failures: 2, goneStreak: 2 });
        expect(options.data.targetId).toBe('ch-1@me');
    });

    it('삭제보다 먼저 기록한다 — 삭제가 던지거나 앱이 죽어도 엔트리는 이미 나갔다', () => {
        const order: string[] = [];
        errorSpy.mockImplementation(() => void order.push('log'));
        const cacheDelete = jest.fn(() => void order.push('delete'));
        mockRepositories.current = { join: { cacheDelete }, chat: { cacheClearByChannelId: jest.fn() } };

        const plan = planOf('join');
        // lib의 onStopped는 readSnapshot을 거쳐 onRemove로 간다.
        plan?.onStopped?.(
            { type: 'join', id: 'ch-1@me' } as never,
            FAILURE as never,
            {
                readSnapshot: () => undefined,
            } as never
        );

        expect(order).toEqual(['log', 'delete']);
    });
});

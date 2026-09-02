import { act, renderHook } from '@testing-library/react';

import { useSessionStalenessGuard } from './useSessionStalenessGuard';

const mockHasStored = jest.fn();
const mockIsExpired = jest.fn();
const mockRequestRefresh = jest.fn();
const mockVerified = jest.fn();

jest.mock('../../../http/transport', () => ({
    hasStoredRelaySession: (...a: unknown[]) => mockHasStored(...a),
    isStoredSessionExpired: (...a: unknown[]) => mockIsExpired(...a),
}));
jest.mock('../../../socket/auth/requestRelaySessionRefresh', () => ({
    requestRelaySessionRefresh: (...a: unknown[]) => mockRequestRefresh(...a),
}));
jest.mock('../../../runtime/useKindVerified', () => ({
    useKindVerified: (...a: unknown[]) => mockVerified(...a),
}));
jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const mockTimeToExpiry = jest.fn();
jest.mock('../../auth/credentialFreshness', () => ({
    credentialFreshness: { timeToExpiry: (...a: unknown[]) => mockTimeToExpiry(...(a as [])), isStale: jest.fn() },
}));

/** The hook only ever calls `check` itself through triggers; drive it directly for policy cases. */
const runCheck = async (policy = {}) => {
    const { result } = renderHook(() => useSessionStalenessGuard({ intervalMs: null, ...policy }));
    await act(async () => {
        await result.current.check();
    });
    return result;
};

beforeEach(() => {
    jest.clearAllMocks();
    mockVerified.mockReturnValue(false);
    mockHasStored.mockResolvedValue(true);
    mockIsExpired.mockResolvedValue(false);
    mockRequestRefresh.mockResolvedValue(true);
    // 측정 불가가 기본값 — 자격증명이 없는 테스트 세션의 실제 상태이고, 그 경우 선제 갱신은
    // 예전처럼 무조건 나간다(아래 describe가 그 계약을 따로 고정한다).
    mockTimeToExpiry.mockReturnValue(null);
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('useSessionStalenessGuard — 프로브', () => {
    it('만료되지 않았으면 refresh를 요청하지 않는다 (정상 구간)', async () => {
        await runCheck();

        expect(mockRequestRefresh).not.toHaveBeenCalled();
    });

    it('만료됐으면 requestRelaySessionRefresh로 넘긴다 — 직접 refresh하지 않는다', async () => {
        mockIsExpired.mockResolvedValue(true);

        await runCheck();

        expect(mockRequestRefresh).toHaveBeenCalled();
    });

    it('오프라인이면 프로브조차 하지 않는다 — 죽은 링크로 teardown이 유발되면 안 된다', async () => {
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

        await runCheck();

        expect(mockHasStored).not.toHaveBeenCalled();
    });
});

describe('useSessionStalenessGuard — 정책 (두 앱의 차이가 옵션이 된다)', () => {
    it('missingSessionCountsAsFailure=false면 세션 부재는 실패가 아니다 (apps/web 판)', async () => {
        mockHasStored.mockResolvedValue(false);
        const onTeardown = jest.fn();

        await runCheck({ missingSessionCountsAsFailure: false, consecutiveFailureLimit: 1, onTeardown });

        expect(onTeardown).not.toHaveBeenCalled();
    });

    it('missingSessionCountsAsFailure=true면 세션 부재가 teardown으로 이어진다 (admin-v2 판)', async () => {
        mockHasStored.mockResolvedValue(false);
        const onTeardown = jest.fn();

        await runCheck({ missingSessionCountsAsFailure: true, consecutiveFailureLimit: 1, onTeardown });

        expect(onTeardown).toHaveBeenCalled();
    });

    it('연속 실패가 한도에 닿아야 teardown한다 — 일시적 실패 한 번으로는 안 된다', async () => {
        mockIsExpired.mockResolvedValue(true);
        mockRequestRefresh.mockResolvedValue(false);
        const onTeardown = jest.fn();

        const { result } = renderHook(() =>
            useSessionStalenessGuard({ intervalMs: null, consecutiveFailureLimit: 3, onTeardown })
        );

        await act(async () => {
            await result.current.check();
            await result.current.check();
        });
        expect(onTeardown).not.toHaveBeenCalled();

        await act(async () => {
            await result.current.check();
        });
        expect(onTeardown).toHaveBeenCalledTimes(1);
    });

    it('중간에 한 번 성공하면 연속 실패가 초기화된다', async () => {
        mockIsExpired.mockResolvedValue(true);
        mockRequestRefresh.mockResolvedValue(false);
        const onTeardown = jest.fn();

        const { result } = renderHook(() =>
            useSessionStalenessGuard({ intervalMs: null, consecutiveFailureLimit: 2, onTeardown })
        );

        await act(async () => {
            await result.current.check();
        });
        mockRequestRefresh.mockResolvedValue(true);
        await act(async () => {
            await result.current.check();
        });
        mockRequestRefresh.mockResolvedValue(false);
        await act(async () => {
            await result.current.check();
        });

        expect(onTeardown).not.toHaveBeenCalled();
    });

    it('consecutiveFailureLimit=null이면 절대 teardown하지 않는다 (apps/web은 수동 로그아웃만)', async () => {
        mockIsExpired.mockResolvedValue(true);
        mockRequestRefresh.mockResolvedValue(false);
        const onTeardown = jest.fn();

        const { result } = renderHook(() =>
            useSessionStalenessGuard({ intervalMs: null, consecutiveFailureLimit: null, onTeardown })
        );
        await act(async () => {
            await result.current.check();
            await result.current.check();
            await result.current.check();
        });

        expect(onTeardown).not.toHaveBeenCalled();
    });

    it('예외는 실패로 세지 않는다 — 세션이 죽었다는 근거가 아니다', async () => {
        mockHasStored.mockRejectedValue(new Error('storage race'));
        const onTeardown = jest.fn();

        await runCheck({ consecutiveFailureLimit: 1, onTeardown });

        expect(onTeardown).not.toHaveBeenCalled();
    });
});

describe('useSessionStalenessGuard — forceRefresh (부팅/포그라운드 선제 갱신)', () => {
    // The handshake's auth.update emits no token, so boot runs on the pre-sleep credential until the
    // SDK's own 5-min timer fires. The expiry probe cannot see that — it only reads expired_time.
    it('만료되지 않았어도 refresh를 요청한다', async () => {
        mockIsExpired.mockResolvedValue(false);

        await runCheck({ forceRefresh: true });

        expect(mockRequestRefresh).toHaveBeenCalled();
    });

    it('쿨다운 안에서는 두 번째 트리거를 흘려보낸다 (포그라운드 연타 방어)', async () => {
        mockIsExpired.mockResolvedValue(false);

        const { result } = renderHook(() => useSessionStalenessGuard({ intervalMs: null, forceRefresh: true }));
        await act(async () => {
            await result.current.check();
            await result.current.check();
        });

        expect(mockRequestRefresh).toHaveBeenCalledTimes(1);
    });

    it('쿨다운이 지나면 다시 요청한다', async () => {
        jest.useFakeTimers();
        mockIsExpired.mockResolvedValue(false);

        const { result } = renderHook(() => useSessionStalenessGuard({ intervalMs: null, forceRefresh: true }));
        await act(async () => {
            await result.current.check();
        });
        jest.setSystemTime(Date.now() + 61_000);
        await act(async () => {
            await result.current.check();
        });

        expect(mockRequestRefresh).toHaveBeenCalledTimes(2);
        jest.useRealTimers();
    });

    // A still-valid credential that failed to refresh is not a dead session — most often the socket
    // is simply not authenticated yet. Counting it would log out a perfectly live user.
    it('선제 refresh 실패는 teardown 스트릭에 넣지 않는다', async () => {
        mockIsExpired.mockResolvedValue(false);
        mockRequestRefresh.mockResolvedValue(false);
        const onTeardown = jest.fn();

        await runCheck({ forceRefresh: true, consecutiveFailureLimit: 1, onTeardown });

        expect(mockRequestRefresh).toHaveBeenCalled();
        expect(onTeardown).not.toHaveBeenCalled();
    });

    it('실제로 만료된 상태의 실패는 forceRefresh와 무관하게 그대로 실패로 센다', async () => {
        mockIsExpired.mockResolvedValue(true);
        mockRequestRefresh.mockResolvedValue(false);
        const onTeardown = jest.fn();

        await runCheck({ forceRefresh: true, consecutiveFailureLimit: 1, onTeardown });

        expect(onTeardown).toHaveBeenCalledTimes(1);
    });

    it('오프라인이면 forceRefresh여도 아무 요청도 하지 않는다', async () => {
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
        mockIsExpired.mockResolvedValue(false);

        await runCheck({ forceRefresh: true });

        expect(mockHasStored).not.toHaveBeenCalled();
        expect(mockRequestRefresh).not.toHaveBeenCalled();
    });

    it('저장된 세션이 아예 없으면 forceRefresh여도 refresh로 넘어가지 않는다', async () => {
        mockHasStored.mockResolvedValue(false);
        mockIsExpired.mockResolvedValue(false);

        await runCheck({ forceRefresh: true });

        expect(mockRequestRefresh).not.toHaveBeenCalled();
    });
});

describe('useSessionStalenessGuard — 트리거', () => {
    it('intervalMs 주기로 검사한다', async () => {
        jest.useFakeTimers();
        mockIsExpired.mockResolvedValue(true);

        renderHook(() => useSessionStalenessGuard({ intervalMs: 30_000 }));
        await act(async () => {
            jest.advanceTimersByTime(60_000);
        });

        expect(mockRequestRefresh).toHaveBeenCalled();
        jest.useRealTimers();
    });

    it('enabled=false면 아무 트리거도 걸지 않는다', async () => {
        jest.useFakeTimers();
        renderHook(() => useSessionStalenessGuard({ enabled: false, intervalMs: 30_000 }));
        await act(async () => {
            jest.advanceTimersByTime(120_000);
        });

        expect(mockHasStored).not.toHaveBeenCalled();
        jest.useRealTimers();
    });

    it('checkOnRelayVerified는 상승 에지에서만 검사한다', async () => {
        mockIsExpired.mockResolvedValue(true);
        mockVerified.mockReturnValue(false);

        const { rerender } = renderHook(() =>
            useSessionStalenessGuard({ intervalMs: null, checkOnRelayVerified: true })
        );
        expect(mockRequestRefresh).not.toHaveBeenCalled();

        mockVerified.mockReturnValue(true);
        await act(async () => {
            rerender();
        });
        expect(mockRequestRefresh).toHaveBeenCalledTimes(1);

        // 이미 verified인 상태의 재렌더는 에지가 아니다
        await act(async () => {
            rerender();
        });
        expect(mockRequestRefresh).toHaveBeenCalledTimes(1);
    });
});

/**
 * 선제 갱신이 **눈을 감지 않는다**. 예전에는 엣지마다 무조건 쏘았고, 그래서 방금 민팅된 자격증명도
 * 포그라운드 복귀마다 갱신됐다(그리고 로그인 순간의 재인증과 겹쳐 `superseded`를 냈다).
 * 이제 relay 자격증명의 실제 `Expiration`을 재고, 한 refresh 주기보다 여유가 많으면 가만히 있는다.
 */
describe('useSessionStalenessGuard — forceRefresh는 자격증명을 재고 나서 쏜다', () => {
    it('여유가 한 주기보다 많으면 쏘지 않는다 — 소유자가 알아서 갱신한다', async () => {
        mockTimeToExpiry.mockReturnValue(50 * 60_000);

        await runCheck({ forceRefresh: true });

        expect(mockRequestRefresh).not.toHaveBeenCalled();
    });

    it('마진 아래로 떨어졌으면 쏜다 — 소켓이 못 따라온다는 증거다', async () => {
        mockTimeToExpiry.mockReturnValue(60_000);

        await runCheck({ forceRefresh: true });

        expect(mockRequestRefresh).toHaveBeenCalled();
    });

    it('이미 지났으면 쏜다', async () => {
        mockTimeToExpiry.mockReturnValue(-1_000);

        await runCheck({ forceRefresh: true });

        expect(mockRequestRefresh).toHaveBeenCalled();
    });

    it('측정할 수 없으면 쏜다 — 읽을 것이 없을 때는 낮게 추측하는 쪽이 안전하다', async () => {
        mockTimeToExpiry.mockReturnValue(null);

        await runCheck({ forceRefresh: true });

        expect(mockRequestRefresh).toHaveBeenCalled();
    });

    it('실제로 만료된 세션은 자격증명 여유와 무관하게 갱신한다 — 그건 선제가 아니다', async () => {
        mockIsExpired.mockResolvedValue(true);
        mockTimeToExpiry.mockReturnValue(50 * 60_000);

        await runCheck({ forceRefresh: true });

        expect(mockRequestRefresh).toHaveBeenCalled();
    });
});

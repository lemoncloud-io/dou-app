import { act, renderHook } from '@testing-library/react';

import { useCloudCredentialGuard } from './useCloudCredentialGuard';

const mockTimeToExpiry = jest.fn();
const mockRenew = jest.fn();
const mockLoggerWarn = jest.fn();

jest.mock('../../auth/credentialFreshness', () => ({
    credentialFreshness: { timeToExpiry: (...args: unknown[]) => mockTimeToExpiry(...args) },
}));
jest.mock('../../../socket/auth/renewCloudSession', () => ({
    renewCloudSession: (...args: unknown[]) => mockRenew(...args),
}));
jest.mock('@chatic/bridges', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: (...args: unknown[]) => mockLoggerWarn(...args),
        error: jest.fn(),
    },
}));

const MARGIN_MS = 5 * 60_000;

/** Mount, let the immediate first tick settle, and hand back the hook result. */
const mount = async (policy = {}) => {
    const hook = renderHook(() => useCloudCredentialGuard({ checkOnVisible: false, ...policy }));
    await act(async () => {
        await Promise.resolve();
    });
    return hook;
};

beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
    mockTimeToExpiry.mockReturnValue(60 * 60_000);
    mockRenew.mockResolvedValue(true);
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => {
    jest.useRealTimers();
});

describe('useCloudCredentialGuard — 판정', () => {
    it('여유가 충분하면 갱신하지 않는다', async () => {
        await mount();

        expect(mockRenew).not.toHaveBeenCalled();
    });

    it('마진 안으로 들어오면 재발급을 부른다', async () => {
        mockTimeToExpiry.mockReturnValue(MARGIN_MS - 1);

        await mount();

        expect(mockRenew).toHaveBeenCalled();
    });

    it('이미 만료됐어도 부른다 — 늦은 것이 안 하는 것보다 낫다', async () => {
        mockTimeToExpiry.mockReturnValue(-1_000);

        await mount();

        expect(mockRenew).toHaveBeenCalled();
    });

    it('클라우드 세션이 없으면(측정 불가) 아무것도 하지 않는다', async () => {
        mockTimeToExpiry.mockReturnValue(null);

        await mount();

        expect(mockRenew).not.toHaveBeenCalled();
    });

    it('오프라인이면 갱신하지 않는다 — 교환이 실패할 뿐이다', async () => {
        mockTimeToExpiry.mockReturnValue(0);
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

        await mount();

        expect(mockRenew).not.toHaveBeenCalled();
    });

    it('갱신 실패는 경고만 남기고 teardown하지 않는다 — 클라우드는 재입장으로 복구된다', async () => {
        mockTimeToExpiry.mockReturnValue(0);
        mockRenew.mockResolvedValue(false);

        await mount();

        expect(mockLoggerWarn).toHaveBeenCalled();
    });

    it('marginMs를 정책으로 받는다', async () => {
        mockTimeToExpiry.mockReturnValue(30_000);

        await mount({ marginMs: 10_000 });

        expect(mockRenew).not.toHaveBeenCalled();
    });
});

describe('useCloudCredentialGuard — 트리거', () => {
    it('만료 마진까지 잠들었다가 스스로 깨어난다 (폴링이 아니다)', async () => {
        // 6분 남음, 마진 5분 → 1분 뒤에 다시 본다.
        mockTimeToExpiry.mockReturnValue(6 * 60_000);
        await mount();

        expect(mockTimeToExpiry).toHaveBeenCalledTimes(1);

        mockTimeToExpiry.mockReturnValue(MARGIN_MS - 1);
        await act(async () => {
            jest.advanceTimersByTime(60_000);
            await Promise.resolve();
        });

        expect(mockRenew).toHaveBeenCalled();
    });

    it('먼 만료도 상한(5분)마다 다시 본다 — 긴 타이머는 절전 탭에서 늦게 뜬다', async () => {
        mockTimeToExpiry.mockReturnValue(60 * 60_000);
        await mount();

        await act(async () => {
            jest.advanceTimersByTime(5 * 60_000);
            await Promise.resolve();
        });

        expect(mockTimeToExpiry).toHaveBeenCalledTimes(2);
    });

    it('enabled=false면 타이머를 걸지 않는다', async () => {
        mockTimeToExpiry.mockReturnValue(0);

        await mount({ enabled: false });

        expect(mockTimeToExpiry).not.toHaveBeenCalled();
        expect(mockRenew).not.toHaveBeenCalled();
    });

    it('언마운트하면 타이머가 멈춘다', async () => {
        const { unmount } = await mount();
        const callsAtUnmount = mockTimeToExpiry.mock.calls.length;

        unmount();
        await act(async () => {
            jest.advanceTimersByTime(30 * 60_000);
            await Promise.resolve();
        });

        expect(mockTimeToExpiry).toHaveBeenCalledTimes(callsAtUnmount);
    });

    it('checkOnVisible이면 탭이 보일 때 다시 본다', async () => {
        const { result } = await mount({ checkOnVisible: true });
        expect(result.current.check).toBeInstanceOf(Function);

        mockTimeToExpiry.mockReturnValue(0);
        await act(async () => {
            Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));
            await Promise.resolve();
        });

        expect(mockRenew).toHaveBeenCalled();
    });

    it('반환된 check로 호스트가 직접 트리거할 수 있다 (apps/web 포그라운드)', async () => {
        const { result } = await mount();
        mockTimeToExpiry.mockReturnValue(0);

        await act(async () => {
            await result.current.check();
        });

        expect(mockRenew).toHaveBeenCalled();
    });
});

import { act, renderHook } from '@testing-library/react';

import { RELAY_CLOUD_ID } from '@chatic/data';

import { useCloudCredentialGuard } from './useCloudCredentialGuard';

const mockTimeToExpiry = jest.fn();
const mockRenew = jest.fn();
const mockLoggerWarn = jest.fn();
/** The committed cloud, and the slots the manager has bound — what `guardedClouds` reads. */
const mockGetCommittedCloudId = jest.fn();
const mockGetSlotKeys = jest.fn();

jest.mock('../../auth/credentialFreshness', () => ({
    credentialFreshness: { timeToExpiry: (...args: unknown[]) => mockTimeToExpiry(...args) },
}));
jest.mock('../../../socket/auth/renewCloudSession', () => ({
    renewCloudSession: (...args: unknown[]) => mockRenew(...args),
}));
jest.mock('../../../socket/runtime', () => ({
    getSocketManager: () => ({ getSlotKeys: (...args: unknown[]) => mockGetSlotKeys(...args) }),
}));
jest.mock('../../store', () => ({
    getCommittedCloudId: (...args: unknown[]) => mockGetCommittedCloudId(...args),
}));
// The renewers reach these at module load; nothing here exercises them.
jest.mock('../../auth/cloudSession', () => ({ cloudSession: { clearStores: jest.fn() } }));
jest.mock('../../auth/relaySession', () => ({ relaySession: { clearAndRedirect: jest.fn() } }));
jest.mock('../../store/stores', () => ({ cloudStore: { dropCachedCloudTokens: jest.fn() } }));
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
    // One committed cloud, whose slot is bound — today's shape.
    mockGetCommittedCloudId.mockReturnValue('cloud-1');
    mockGetSlotKeys.mockReturnValue([RELAY_CLOUD_ID, 'cloud-1']);
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

        expect(mockRenew).toHaveBeenCalledWith('cloud-1');
    });

    it('measures nothing and renews nothing when no cloud session exists', async () => {
        mockGetCommittedCloudId.mockReturnValue(null);
        mockGetSlotKeys.mockReturnValue([RELAY_CLOUD_ID]);

        await mount();

        expect(mockTimeToExpiry).not.toHaveBeenCalled();
        expect(mockRenew).not.toHaveBeenCalled();
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

describe('useCloudCredentialGuard — every cloud slot', () => {
    /** The clouds measured so far, in order (the renewer passes `now` as a second argument). */
    const measured = (): string[] => mockTimeToExpiry.mock.calls.map(call => call[0] as string);

    it('measures each cloud on its own and renews only the one whose deadline arrived', async () => {
        mockGetCommittedCloudId.mockReturnValue('cloud-1');
        mockGetSlotKeys.mockReturnValue([RELAY_CLOUD_ID, 'cloud-1', 'cloud-2']);
        mockTimeToExpiry.mockImplementation((cid: string) => (cid === 'cloud-2' ? MARGIN_MS - 1 : 60 * 60_000));

        await mount();

        // cloud-2 is measured twice: once to decide, once after its renewal to re-arm the timer.
        expect(measured()).toEqual(['cloud-1', 'cloud-2', 'cloud-2']);
        expect(mockRenew).toHaveBeenCalledTimes(1);
        expect(mockRenew).toHaveBeenCalledWith('cloud-2');
    });

    it('counts the committed cloud once even when its slot is bound, and never the relay slot', async () => {
        mockGetCommittedCloudId.mockReturnValue('cloud-1');
        mockGetSlotKeys.mockReturnValue([RELAY_CLOUD_ID, 'cloud-1']);

        await mount();

        expect(measured()).toEqual(['cloud-1']);
    });

    it('arms the timer on the EARLIEST deadline among the clouds', async () => {
        mockGetSlotKeys.mockReturnValue([RELAY_CLOUD_ID, 'cloud-1', 'cloud-2']);
        // cloud-1 has an hour, cloud-2 has six minutes → the next look is in one minute, for cloud-2.
        mockTimeToExpiry.mockImplementation((cid: string) => (cid === 'cloud-2' ? 6 * 60_000 : 60 * 60_000));
        await mount();

        mockTimeToExpiry.mockImplementation((cid: string) => (cid === 'cloud-2' ? MARGIN_MS - 1 : 60 * 60_000));
        await act(async () => {
            jest.advanceTimersByTime(60_000);
            await Promise.resolve();
        });

        expect(mockRenew).toHaveBeenCalledWith('cloud-2');
    });

    it('a cloud whose evaluation THROWS costs only itself a retry — the others renew and the timer re-arms', async () => {
        mockGetSlotKeys.mockReturnValue([RELAY_CLOUD_ID, 'cloud-1', 'cloud-2']);
        mockTimeToExpiry.mockImplementation((cid: string) => {
            if (cid === 'cloud-1') throw new Error('corrupt storage');
            return 0;
        });

        await mount();

        expect(mockRenew).toHaveBeenCalledWith('cloud-2');
        expect(mockRenew).not.toHaveBeenCalledWith('cloud-1');
        expect(mockLoggerWarn).toHaveBeenCalledWith('SESSION', expect.stringContaining('evaluation failed'), {
            error: expect.any(Error),
            data: { cid: 'cloud-1' },
        });

        // The failed cloud bought a retry sleep (60s), and the guard is still alive to take it.
        mockTimeToExpiry.mockImplementation(() => 60 * 60_000);
        await act(async () => {
            jest.advanceTimersByTime(60_000);
            await Promise.resolve();
        });
        expect(mockTimeToExpiry.mock.calls.length).toBeGreaterThan(4);
    });

    it('one cloud’s failed renewal does not stop the next cloud from being renewed', async () => {
        mockGetSlotKeys.mockReturnValue([RELAY_CLOUD_ID, 'cloud-1', 'cloud-2']);
        mockTimeToExpiry.mockReturnValue(0);
        mockRenew.mockImplementation(async (cid: string) => cid !== 'cloud-1');

        await mount();

        expect(mockRenew).toHaveBeenCalledWith('cloud-1');
        expect(mockRenew).toHaveBeenCalledWith('cloud-2');
    });
});

describe('useCloudCredentialGuard — 트리거', () => {
    it('만료 마진까지 잠들었다가 스스로 깨어난다 (폴링이 아니다)', async () => {
        // 6 minutes left, 5-minute margin → check again in 1 minute.
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

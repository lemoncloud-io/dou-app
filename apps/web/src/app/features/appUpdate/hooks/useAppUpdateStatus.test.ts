import { act, renderHook } from '@testing-library/react';

const mockIsNative = jest.fn();
// Every level, not just what the hook happened to use before: a partial logger mock turns a new
// entry into a TypeError inside the effect.
const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('@chatic/bridges', () => ({
    isNative: (...args: unknown[]) => mockIsNative(...args),
    logger: mockLogger,
}));

const mockCheckAppUpdate = jest.fn();
jest.mock('../../../bridge', () => ({
    appBridge: {
        checkAppUpdate: (...args: unknown[]) => mockCheckAppUpdate(...args),
        openStore: jest.fn(),
    },
}));

// eslint-disable-next-line @typescript-eslint/no-empty-function
let foregroundHandler: () => void = () => {};
jest.mock('../../../bridge/useAppForeground', () => ({
    useAppForeground: (handler: () => void) => {
        foregroundHandler = handler;
    },
}));

import { useAppUpdateStatus, useAppUpdateStore } from './useAppUpdateStatus';

const updateResponse = (latestVersion: string, updateAvailable = true) => ({
    success: true,
    data: { platform: 'ios', currentVersion: '1.0.0', latestVersion, updateAvailable, storeUrl: 'x' },
});

const flush = () =>
    act(async () => {
        await Promise.resolve();
    });

describe('useAppUpdateStatus', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        useAppUpdateStore.setState({ updateAvailable: false, latestVersion: '' });
    });

    it('비네이티브에서는 브릿지를 호출하지 않고 기본 상태를 유지한다', async () => {
        mockIsNative.mockReturnValue(false);
        const { result } = renderHook(() => useAppUpdateStatus());
        await flush();

        expect(mockCheckAppUpdate).not.toHaveBeenCalled();
        expect(result.current).toEqual({ updateAvailable: false, latestVersion: '' });
    });

    it('마운트 시 체크 결과를 공유 스토어에 반영한다', async () => {
        mockIsNative.mockReturnValue(true);
        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.4.0'));

        const { result } = renderHook(() => useAppUpdateStatus());
        await flush();

        expect(result.current).toEqual({ updateAvailable: true, latestVersion: '1.4.0' });
        expect(useAppUpdateStore.getState().updateAvailable).toBe(true);
    });

    it('나중에 마운트된 소비자도 이미 확인된 결과를 그대로 읽는다', async () => {
        mockIsNative.mockReturnValue(true);
        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.4.0'));

        const first = renderHook(() => useAppUpdateStatus());
        await flush();
        first.unmount();

        const { result } = renderHook(() => useAppUpdateStatus());
        expect(result.current).toEqual({ updateAvailable: true, latestVersion: '1.4.0' });
    });

    it('foreground로 복귀하면 다시 확인하고 상태를 갱신한다', async () => {
        mockIsNative.mockReturnValue(true);
        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.0.0', false));

        const { result } = renderHook(() => useAppUpdateStatus());
        await flush();
        expect(result.current.updateAvailable).toBe(false);

        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.5.0'));
        await act(async () => {
            foregroundHandler();
            await Promise.resolve();
        });

        expect(mockCheckAppUpdate).toHaveBeenCalledTimes(2);
        expect(result.current).toEqual({ updateAvailable: true, latestVersion: '1.5.0' });
    });

    it('체크가 실패하면 직전 상태를 그대로 유지한다', async () => {
        mockIsNative.mockReturnValue(true);
        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.4.0'));

        const { result } = renderHook(() => useAppUpdateStatus());
        await flush();

        mockCheckAppUpdate.mockRejectedValue(new Error('NATIVE_NOT_SUPPORTED'));
        await act(async () => {
            foregroundHandler();
            await Promise.resolve();
        });

        expect(result.current).toEqual({ updateAvailable: true, latestVersion: '1.4.0' });
    });
});

describe('useAppUpdateStatus — 기록 (ADR-0075)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        useAppUpdateStore.setState({ updateAvailable: false, latestVersion: '' });
        mockIsNative.mockReturnValue(true);
    });

    // 실패해도 마지막 상태가 그대로 보이므로, 화면상 "업데이트 없음"과 구분되지 않는다.
    it('체크 실패를 warn으로 남긴다', async () => {
        mockCheckAppUpdate.mockRejectedValue(new Error('bridge boom'));
        renderHook(() => useAppUpdateStatus());
        await flush();

        expect(mockLogger.warn).toHaveBeenCalledWith('VERSION', 'app update check failed', {
            error: expect.any(Error),
        });
    });

    it('업데이트가 새로 잡히면 전이를 info로 남긴다', async () => {
        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.4.0'));
        renderHook(() => useAppUpdateStatus());
        await flush();

        expect(mockLogger.info).toHaveBeenCalledWith('VERSION', 'app update available', {
            updateAvailable: true,
            latestVersion: '1.4.0',
        });
    });

    // 마운트와 포그라운드 복귀마다 도는 훅이라, 상태를 매번 남기면 하루 종일 같은 줄이 쌓인다.
    it('상태가 그대로면 다시 남기지 않는다', async () => {
        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.4.0'));
        renderHook(() => useAppUpdateStatus());
        await flush();
        mockLogger.info.mockClear();

        await act(async () => {
            foregroundHandler();
            await Promise.resolve();
        });

        expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('업데이트가 더 이상 제시되지 않는 전이도 남긴다', async () => {
        useAppUpdateStore.setState({ updateAvailable: true, latestVersion: '1.4.0' });
        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.4.0', false));
        renderHook(() => useAppUpdateStatus());
        await flush();

        expect(mockLogger.info).toHaveBeenCalledWith('VERSION', 'app update no longer offered', {
            updateAvailable: false,
            latestVersion: '1.4.0',
        });
    });

    it('비네이티브에서는 아무것도 남기지 않는다', async () => {
        mockIsNative.mockReturnValue(false);
        renderHook(() => useAppUpdateStatus());
        await flush();

        expect(mockLogger.info).not.toHaveBeenCalled();
        expect(mockLogger.warn).not.toHaveBeenCalled();
    });
});

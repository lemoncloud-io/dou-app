import { act, renderHook } from '@testing-library/react';

const mockIsNative = jest.fn();
jest.mock('@chatic/bridges', () => ({
    isNative: (...args: unknown[]) => mockIsNative(...args),
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

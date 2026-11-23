import { act, renderHook } from '@testing-library/react';

const mockIsNative = jest.fn();
jest.mock('@chatic/runtime', () => {
    const { browserAppShell, fakeRuntimeModule } = require('@chatic/runtime/testing');
    return fakeRuntimeModule({
        get appShell() {
            const storeUpdate = { check: () => mockCheckAppUpdate(), openStore: () => mockOpenStore() };
            return { ...browserAppShell(), storeUpdate: mockIsNative() ? storeUpdate : null };
        },
        settings: { set: (...args: unknown[]) => mockSet(...args), useConfigValue: () => dismissedUpdateVersion },
    });
});
jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockCheckAppUpdate = jest.fn();
const mockOpenStore = jest.fn();

// eslint-disable-next-line @typescript-eslint/no-empty-function
let foregroundHandler: () => void = () => {};
jest.mock('../../../bridge/useAppForeground', () => ({
    useAppForeground: (handler: () => void) => {
        foregroundHandler = handler;
    },
}));

const mockSet = jest.fn();
let dismissedUpdateVersion = '';

import { useAppUpdateStore } from './useAppUpdateStatus';
import { useAppUpdatePrompt } from './useAppUpdatePrompt';

const updateResponse = (latestVersion: string, updateAvailable = true) => ({ latestVersion, updateAvailable });

const flush = () =>
    act(async () => {
        await Promise.resolve();
    });

describe('useAppUpdatePrompt', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        dismissedUpdateVersion = '';
        useAppUpdateStore.setState({ updateAvailable: false, latestVersion: '' });
    });

    it('비네이티브에서는 마운트 시 checkAppUpdate를 호출하지 않는다', async () => {
        mockIsNative.mockReturnValue(false);
        const { result } = renderHook(() => useAppUpdatePrompt());
        await flush();

        expect(mockCheckAppUpdate).not.toHaveBeenCalled();
        expect(result.current.open).toBe(false);
    });

    it('네이티브에서 업데이트가 있고 아직 dismiss하지 않은 버전이면 다이얼로그를 연다', async () => {
        mockIsNative.mockReturnValue(true);
        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.1.0'));

        const { result } = renderHook(() => useAppUpdatePrompt());
        await flush();

        expect(result.current.open).toBe(true);
    });

    it('이미 해당 버전을 dismiss했으면 다이얼로그를 열지 않는다', async () => {
        mockIsNative.mockReturnValue(true);
        dismissedUpdateVersion = '1.1.0';
        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.1.0'));

        const { result } = renderHook(() => useAppUpdatePrompt());
        await flush();

        expect(result.current.open).toBe(false);
    });

    it('checkAppUpdate가 실패하면 조용히 무시하고 다이얼로그를 열지 않는다', async () => {
        mockIsNative.mockReturnValue(true);
        mockCheckAppUpdate.mockRejectedValue(new Error('NATIVE_NOT_SUPPORTED'));

        const { result } = renderHook(() => useAppUpdatePrompt());
        await flush();

        expect(result.current.open).toBe(false);
    });

    it('foreground로 복귀하면 다시 checkAppUpdate를 호출한다', async () => {
        mockIsNative.mockReturnValue(true);
        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.0.0', false));

        renderHook(() => useAppUpdatePrompt());
        await flush();
        expect(mockCheckAppUpdate).toHaveBeenCalledTimes(1);

        await act(async () => {
            foregroundHandler();
            await Promise.resolve();
        });

        expect(mockCheckAppUpdate).toHaveBeenCalledTimes(2);
    });

    it('dismiss는 현재 latestVersion을 local 레인으로 쓰고 다이얼로그를 닫는다', async () => {
        mockIsNative.mockReturnValue(true);
        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.2.0'));

        const { result, rerender } = renderHook(() => useAppUpdatePrompt());
        await flush();
        expect(result.current.open).toBe(true);
        expect(mockCheckAppUpdate).toHaveBeenCalledTimes(1);

        act(() => result.current.dismiss());
        dismissedUpdateVersion = '1.2.0';
        rerender();

        expect(mockSet).toHaveBeenCalledWith('ui.dismissedUpdateVersion', '1.2.0', { lane: 'local' });
        expect(result.current.open).toBe(false);
        expect(mockCheckAppUpdate).toHaveBeenCalledTimes(1);
    });

    it('dismiss한 뒤 같은 버전이 다시 확인돼도 다이얼로그를 다시 열지 않는다', async () => {
        mockIsNative.mockReturnValue(true);
        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.2.0'));

        const { result, rerender } = renderHook(() => useAppUpdatePrompt());
        await flush();
        act(() => result.current.dismiss());
        dismissedUpdateVersion = '1.2.0';
        rerender();

        await act(async () => {
            foregroundHandler();
            await Promise.resolve();
        });

        expect(result.current.open).toBe(false);
    });

    it('dismiss한 버전보다 더 새로운 버전이 나오면 다시 다이얼로그를 연다', async () => {
        mockIsNative.mockReturnValue(true);
        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.2.0'));

        const { result, rerender } = renderHook(() => useAppUpdatePrompt());
        await flush();
        act(() => result.current.dismiss());
        dismissedUpdateVersion = '1.2.0';
        rerender();
        expect(result.current.open).toBe(false);

        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.3.0'));
        await act(async () => {
            foregroundHandler();
            await Promise.resolve();
        });

        expect(result.current.open).toBe(true);
    });

    it('goToStore opens the store listing, records the version as dismissed on the local lane and closes the dialog', async () => {
        mockIsNative.mockReturnValue(true);
        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.2.0'));

        const { result, rerender } = renderHook(() => useAppUpdatePrompt());
        await flush();

        act(() => result.current.goToStore());
        dismissedUpdateVersion = '1.2.0';
        rerender();

        expect(mockOpenStore).toHaveBeenCalled();
        expect(mockSet).toHaveBeenCalledWith('ui.dismissedUpdateVersion', '1.2.0', { lane: 'local' });
        expect(result.current.open).toBe(false);
    });
});

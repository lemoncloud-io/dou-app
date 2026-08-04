import { act, renderHook } from '@testing-library/react';

const mockIsNative = jest.fn();
jest.mock('@chatic/bridges', () => ({
    isNative: (...args: unknown[]) => mockIsNative(...args),
}));

const mockCheckAppUpdate = jest.fn();
const mockOpenStore = jest.fn();
jest.mock('../../../bridge', () => ({
    appBridge: {
        checkAppUpdate: (...args: unknown[]) => mockCheckAppUpdate(...args),
        openStore: (...args: unknown[]) => mockOpenStore(...args),
    },
}));

// eslint-disable-next-line @typescript-eslint/no-empty-function
let foregroundHandler: () => void = () => {};
jest.mock('../../../bridge/useAppForeground', () => ({
    useAppForeground: (handler: () => void) => {
        foregroundHandler = handler;
    },
}));

// A real (tiny) zustand store rather than a static fake: `open` is derived from the persisted
// dismissal, so dismissing has to actually re-render the hook the way the app store does.
const mockDismissUpdate = jest.fn();
jest.mock('../../../stores/usePreferenceStore', () => {
    const { create } = jest.requireActual('zustand');
    return {
        usePreferenceStore: create((set: (partial: unknown) => void) => ({
            dismissedUpdateVersion: '',
            dismissUpdate: (version: string) => {
                mockDismissUpdate(version);
                set({ dismissedUpdateVersion: version });
            },
        })),
    };
});

import { usePreferenceStore } from '../../../stores/usePreferenceStore';
import { useAppUpdateStore } from './useAppUpdateStatus';
import { useAppUpdatePrompt } from './useAppUpdatePrompt';

const updateResponse = (latestVersion: string, updateAvailable = true) => ({
    success: true,
    data: { platform: 'ios', currentVersion: '1.0.0', latestVersion, updateAvailable, storeUrl: 'x' },
});

const flush = () =>
    act(async () => {
        await Promise.resolve();
    });

describe('useAppUpdatePrompt', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        usePreferenceStore.setState({ dismissedUpdateVersion: '' });
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
        usePreferenceStore.setState({ dismissedUpdateVersion: '1.1.0' });
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

    it('dismiss는 현재 latestVersion으로 dismissUpdate를 호출하고 다이얼로그를 닫는다', async () => {
        mockIsNative.mockReturnValue(true);
        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.2.0'));

        const { result } = renderHook(() => useAppUpdatePrompt());
        await flush();
        expect(result.current.open).toBe(true);
        expect(mockCheckAppUpdate).toHaveBeenCalledTimes(1);

        act(() => result.current.dismiss());
        await flush();

        expect(mockDismissUpdate).toHaveBeenCalledWith('1.2.0');
        expect(result.current.open).toBe(false);
        // dismiss() must not re-trigger the mount-check effect with a fresh bridge round-trip.
        expect(mockCheckAppUpdate).toHaveBeenCalledTimes(1);
    });

    it('dismiss한 뒤 같은 버전이 다시 확인돼도 다이얼로그를 다시 열지 않는다', async () => {
        mockIsNative.mockReturnValue(true);
        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.2.0'));

        const { result } = renderHook(() => useAppUpdatePrompt());
        await flush();
        act(() => result.current.dismiss());
        await flush();

        await act(async () => {
            foregroundHandler();
            await Promise.resolve();
        });

        expect(result.current.open).toBe(false);
    });

    it('dismiss한 버전보다 더 새로운 버전이 나오면 다시 다이얼로그를 연다', async () => {
        mockIsNative.mockReturnValue(true);
        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.2.0'));

        const { result } = renderHook(() => useAppUpdatePrompt());
        await flush();
        act(() => result.current.dismiss());
        await flush();
        expect(result.current.open).toBe(false);

        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.3.0'));
        await act(async () => {
            foregroundHandler();
            await Promise.resolve();
        });

        expect(result.current.open).toBe(true);
    });

    it('goToStore는 appBridge.openStore를 호출하고 dismissUpdate도 함께 호출한 뒤 다이얼로그를 닫는다', async () => {
        mockIsNative.mockReturnValue(true);
        mockCheckAppUpdate.mockResolvedValue(updateResponse('1.2.0'));

        const { result } = renderHook(() => useAppUpdatePrompt());
        await flush();

        act(() => result.current.goToStore());

        expect(mockOpenStore).toHaveBeenCalled();
        expect(mockDismissUpdate).toHaveBeenCalledWith('1.2.0');
        expect(result.current.open).toBe(false);
    });
});

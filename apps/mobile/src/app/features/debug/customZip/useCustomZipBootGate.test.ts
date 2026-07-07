import { act, renderHook } from '@testing-library/react';

import { defaultDebugSettings, useDebugSettingsStore } from '../../../stores/debugSettingsStore';
import { restoreCustomZip } from './customZipService';
import { useCustomZipBootGate } from './useCustomZipBootGate';

// Mock react-native-config (debugSettingsStore가 기본 URL 계산에 사용)
jest.mock('react-native-config', () => ({
    default: {
        VITE_ENV: 'DEV',
        VITE_WEBVIEW_BASE_URL: 'http://localhost:5003/',
    },
}));

// storageAdapter는 native preferenceService를 끌어오므로 noop storage로 대체
jest.mock('../../../stores/storageAdapter', () => ({
    storageAdapter: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
    },
}));

jest.mock('./customZipService', () => ({
    restoreCustomZip: jest.fn(),
}));

const mockRestore = restoreCustomZip as jest.Mock;

const LOCAL_ROOT = '/docs/custom-web/webroot/abc123';
const ORIGIN = 'http://127.0.0.1:8890';

const createDeferred = <T>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(res => {
        resolve = res;
    });
    return { promise, resolve };
};

describe('useCustomZipBootGate', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        useDebugSettingsStore.setState({ ...defaultDebugSettings });
    });

    it('is not restoring and skips restore when no localRoot is persisted', () => {
        const { result } = renderHook(() => useCustomZipBootGate());

        expect(result.current.isRestoringCustomZip).toBe(false);
        expect(mockRestore).not.toHaveBeenCalled();
    });

    it('RACE REGRESSION: serverUrl stays null and gate stays open until the server start settles', async () => {
        useDebugSettingsStore.setState({ customZipLocalRoot: LOCAL_ROOT });
        const restore = createDeferred<string | null>();
        mockRestore.mockReturnValue(restore.promise);

        const { result } = renderHook(() => useCustomZipBootGate());

        // pending 동안: 게이트 열림 + serverUrl 미설정
        expect(result.current.isRestoringCustomZip).toBe(true);
        expect(useDebugSettingsStore.getState().customZipServerUrl).toBeNull();
        expect(mockRestore).toHaveBeenCalledWith(LOCAL_ROOT);

        await act(async () => {
            restore.resolve(ORIGIN);
            await restore.promise;
        });

        expect(useDebugSettingsStore.getState().customZipServerUrl).toBe(`${ORIGIN}/`);
        expect(useDebugSettingsStore.getState().customZipLocalRoot).toBe(LOCAL_ROOT);
        expect(result.current.isRestoringCustomZip).toBe(false);
    });

    it('stale root: clears persisted localRoot and never sets serverUrl when restore returns null', async () => {
        useDebugSettingsStore.setState({ customZipLocalRoot: LOCAL_ROOT });
        const restore = createDeferred<string | null>();
        mockRestore.mockReturnValue(restore.promise);

        const { result } = renderHook(() => useCustomZipBootGate());
        expect(result.current.isRestoringCustomZip).toBe(true);

        await act(async () => {
            restore.resolve(null);
            await restore.promise;
        });

        expect(useDebugSettingsStore.getState().customZipLocalRoot).toBeNull();
        expect(useDebugSettingsStore.getState().customZipServerUrl).toBeNull();
        expect(result.current.isRestoringCustomZip).toBe(false);
    });

    it('runs the restore only once across rerenders', async () => {
        useDebugSettingsStore.setState({ customZipLocalRoot: LOCAL_ROOT });
        mockRestore.mockResolvedValue(ORIGIN);

        const { rerender } = renderHook(() => useCustomZipBootGate());
        await act(async () => {
            await Promise.resolve();
        });
        rerender();
        rerender();

        expect(mockRestore).toHaveBeenCalledTimes(1);
    });
});

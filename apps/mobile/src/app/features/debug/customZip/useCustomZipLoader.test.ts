import { act, renderHook } from '@testing-library/react';

import { useDebugRuntimeStore } from '../../../stores/debugRuntimeStore';
import { defaultDebugSettings, useDebugSettingsStore } from '../../../stores/debugSettingsStore';
import {
    cleanupCustomZipDir,
    downloadZip,
    extractZip,
    startCustomZipServer,
    stopCustomZipServer,
} from './customZipService';
import { useCustomZipLoader } from './useCustomZipLoader';

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
    cleanupCustomZipDir: jest.fn(),
    downloadZip: jest.fn(),
    extractZip: jest.fn(),
    startCustomZipServer: jest.fn(),
    stopCustomZipServer: jest.fn(),
}));

const mockCleanup = cleanupCustomZipDir as jest.Mock;
const mockDownloadZip = downloadZip as jest.Mock;
const mockExtractZip = extractZip as jest.Mock;
const mockStartServer = startCustomZipServer as jest.Mock;
const mockStopServer = stopCustomZipServer as jest.Mock;

const ZIP_URL = 'https://cdn.example.com/bundle.zip';
const ZIP_PATH = '/docs/custom-web/bundle.zip';
const EXTRACT_ROOT = '/docs/custom-web/webroot/abc123';
const ORIGIN = 'http://127.0.0.1:8890';

const createDeferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

describe('useCustomZipLoader', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        useDebugSettingsStore.setState({ ...defaultDebugSettings });
        useDebugRuntimeStore.setState({ webViewReloadToken: 0 });
        mockCleanup.mockResolvedValue(undefined);
        mockDownloadZip.mockResolvedValue(ZIP_PATH);
        mockExtractZip.mockResolvedValue(EXTRACT_ROOT);
        mockStartServer.mockResolvedValue(ORIGIN);
        mockStopServer.mockResolvedValue(undefined);
    });

    it('applyZip success: transitions idle→downloading→extracting→serving and commits store only after server start', async () => {
        const download = createDeferred<string>();
        const extract = createDeferred<string>();
        const start = createDeferred<string>();
        mockDownloadZip.mockReturnValue(download.promise);
        mockExtractZip.mockReturnValue(extract.promise);
        mockStartServer.mockReturnValue(start.promise);

        const { result } = renderHook(() => useCustomZipLoader());
        expect(result.current.status).toBe('idle');

        let applyPromise!: Promise<boolean>;
        act(() => {
            applyPromise = result.current.applyZip(ZIP_URL);
        });
        expect(result.current.status).toBe('downloading');

        await act(async () => {
            download.resolve(ZIP_PATH);
            await Promise.resolve();
        });
        expect(result.current.status).toBe('extracting');
        expect(mockExtractZip).toHaveBeenCalledWith(ZIP_PATH, ZIP_URL);

        await act(async () => {
            extract.resolve(EXTRACT_ROOT);
            await Promise.resolve();
        });
        // 서버 start가 pending인 동안 store는 아직 갱신되지 않아야 한다
        expect(useDebugSettingsStore.getState().customZipServerUrl).toBeNull();
        expect(useDebugSettingsStore.getState().customZipLocalRoot).toBeNull();

        await act(async () => {
            start.resolve(ORIGIN);
            await expect(applyPromise).resolves.toBe(true);
        });
        expect(result.current.status).toBe('serving');
        expect(result.current.error).toBeNull();
        expect(useDebugSettingsStore.getState().customZipLocalRoot).toBe(EXTRACT_ROOT);
        expect(useDebugSettingsStore.getState().customZipServerUrl).toBe(`${ORIGIN}/`);
        expect(useDebugRuntimeStore.getState().webViewReloadToken).toBe(1);
    });

    it('applyZip download failure: status error, store untouched (fallback preserved)', async () => {
        mockDownloadZip.mockRejectedValue(new Error('network down'));

        const { result } = renderHook(() => useCustomZipLoader());
        await act(async () => {
            await result.current.applyZip(ZIP_URL);
        });

        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe('network down');
        expect(useDebugSettingsStore.getState().customZipServerUrl).toBeNull();
        expect(useDebugSettingsStore.getState().customZipLocalRoot).toBeNull();
        expect(useDebugRuntimeStore.getState().webViewReloadToken).toBe(0);
    });

    it('applyZip extract failure (index.html missing): status error, store untouched', async () => {
        mockExtractZip.mockRejectedValue(new Error('index.html not found at zip root'));

        const { result } = renderHook(() => useCustomZipLoader());
        await act(async () => {
            await result.current.applyZip(ZIP_URL);
        });

        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe('index.html not found at zip root');
        expect(useDebugSettingsStore.getState().customZipServerUrl).toBeNull();
        expect(useDebugSettingsStore.getState().customZipLocalRoot).toBeNull();
        expect(mockStartServer).not.toHaveBeenCalled();
        expect(useDebugRuntimeStore.getState().webViewReloadToken).toBe(0);
    });

    it('applyZip server start failure: status error, store untouched', async () => {
        mockStartServer.mockRejectedValue(new Error('port in use'));

        const { result } = renderHook(() => useCustomZipLoader());
        await act(async () => {
            await result.current.applyZip(ZIP_URL);
        });

        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe('port in use');
        expect(useDebugSettingsStore.getState().customZipServerUrl).toBeNull();
        expect(useDebugSettingsStore.getState().customZipLocalRoot).toBeNull();
        expect(useDebugRuntimeStore.getState().webViewReloadToken).toBe(0);
    });

    it('applyZip replace failure: tears down the active zip first and falls back to default web with a reload', async () => {
        useDebugSettingsStore.setState({
            customZipLocalRoot: EXTRACT_ROOT,
            customZipServerUrl: `${ORIGIN}/`,
        });
        mockDownloadZip.mockRejectedValue(new Error('network down'));

        const { result } = renderHook(() => useCustomZipLoader());
        let ok = true;
        await act(async () => {
            ok = await result.current.applyZip(ZIP_URL);
        });

        expect(ok).toBe(false);
        expect(result.current.status).toBe('error');
        // 교체 시작 시 기존 서버부터 정지 + 활성 해제 — 삭제된 루트를 가리키는 반쪽 상태 방지
        expect(mockStopServer).toHaveBeenCalledTimes(1);
        expect(useDebugSettingsStore.getState().customZipServerUrl).toBeNull();
        expect(useDebugSettingsStore.getState().customZipLocalRoot).toBeNull();
        // 이전 커스텀은 이미 내려갔으므로 죽은 origin에 머물지 않게 기본 웹으로 재로딩
        expect(useDebugRuntimeStore.getState().webViewReloadToken).toBe(1);
    });

    it('disableZip: stops the server, clears both store fields, and requests a reload', async () => {
        useDebugSettingsStore.setState({
            customZipLocalRoot: EXTRACT_ROOT,
            customZipServerUrl: `${ORIGIN}/`,
        });

        const { result } = renderHook(() => useCustomZipLoader());
        await act(async () => {
            await result.current.disableZip();
        });

        expect(mockStopServer).toHaveBeenCalledTimes(1);
        expect(mockCleanup).toHaveBeenCalledTimes(1);
        expect(useDebugSettingsStore.getState().customZipServerUrl).toBeNull();
        expect(useDebugSettingsStore.getState().customZipLocalRoot).toBeNull();
        expect(useDebugRuntimeStore.getState().webViewReloadToken).toBe(1);
        expect(result.current.status).toBe('idle');
    });
});

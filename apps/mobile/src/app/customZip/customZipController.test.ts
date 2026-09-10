import { useDebugRuntimeStore } from '../stores/debugRuntimeStore';
import { defaultDebugSettings, useDebugSettingsStore } from '../stores/debugSettingsStore';
import {
    cleanupCustomZipDir,
    downloadZip,
    extractZip,
    startCustomZipServer,
    stopCustomZipServer,
} from './customZipService';
import { applyCustomZip, disableCustomZip, readCustomZipState } from './customZipController';

jest.mock('react-native-config', () => ({
    default: { VITE_ENV: 'DEV', VITE_WEBVIEW_BASE_URL: 'http://localhost:5003/' },
}));

// storageAdapter는 native preferenceService를 끌어오므로 noop storage로 대체
jest.mock('../stores/storageAdapter', () => ({
    storageAdapter: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
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

const settings = () => useDebugSettingsStore.getState();
const reloadToken = () => useDebugRuntimeStore.getState().webViewReloadToken;

describe('customZipController', () => {
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

    it('성공하면 origin을 돌려주고, 서버가 뜬 뒤에만 store를 갱신한다', async () => {
        const origin = await applyCustomZip(ZIP_URL);

        expect(origin).toBe(ORIGIN);
        expect(settings().customZipLocalRoot).toBe(EXTRACT_ROOT);
        // 스토어의 setter가 URL을 정규화한다(끝 슬래시) — 컨트롤러가 돌려주는 raw origin과 다르다.
        expect(settings().customZipServerUrl).toBe(`${ORIGIN}/`);
        expect(reloadToken()).toBe(1);
    });

    // store를 먼저 갱신하면 실패 시 이미 지워진 루트를 가리키는 반쪽 상태가 남는다.
    it.each([
        ['다운로드', () => mockDownloadZip.mockRejectedValue(new Error('net'))],
        ['압축 해제', () => mockExtractZip.mockRejectedValue(new Error('no index.html'))],
        ['서버 기동', () => mockStartServer.mockRejectedValue(new Error('port busy'))],
    ])('%s가 실패하면 store를 건드리지 않아 기본 웹이 유지된다', async (_label, arrange) => {
        arrange();

        await expect(applyCustomZip(ZIP_URL)).rejects.toThrow();

        expect(settings().customZipLocalRoot).toBeNull();
        expect(settings().customZipServerUrl).toBeNull();
    });

    // 교체 실패는 이전 커스텀 서버가 이미 내려간 상태 — 죽은 origin에 머물면 흰 화면이다.
    it('교체가 실패하면 활성 zip을 먼저 내리고 기본 웹으로 재로딩한다', async () => {
        useDebugSettingsStore.setState({ customZipLocalRoot: '/old/root', customZipServerUrl: 'http://127.0.0.1:1' });
        mockDownloadZip.mockRejectedValue(new Error('net'));

        await expect(applyCustomZip(ZIP_URL)).rejects.toThrow();

        expect(mockStopServer).toHaveBeenCalledTimes(1);
        expect(settings().customZipLocalRoot).toBeNull();
        expect(settings().customZipServerUrl).toBeNull();
        expect(reloadToken()).toBe(1);
    });

    it('끄면 서버를 내리고 두 필드를 비우고 재로딩을 요청한다', async () => {
        useDebugSettingsStore.setState({ customZipLocalRoot: EXTRACT_ROOT, customZipServerUrl: ORIGIN });

        await disableCustomZip();

        expect(mockStopServer).toHaveBeenCalledTimes(1);
        expect(mockCleanup).toHaveBeenCalledTimes(1);
        expect(settings().customZipLocalRoot).toBeNull();
        expect(settings().customZipServerUrl).toBeNull();
        expect(reloadToken()).toBe(1);
    });

    it('상태 읽기는 store의 두 필드를 그대로 돌려준다', () => {
        useDebugSettingsStore.setState({ customZipLocalRoot: EXTRACT_ROOT, customZipServerUrl: ORIGIN });

        expect(readCustomZipState()).toEqual({ localRoot: EXTRACT_ROOT, serverUrl: ORIGIN });
    });
});

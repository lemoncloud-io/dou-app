import StaticServer from '@dr.pogodin/react-native-static-server';
import { unzip } from 'react-native-zip-archive';

import { FileManagerBridge } from '../../../bridge/FileManagerBridge';
import {
    CUSTOM_ZIP_HOST,
    CUSTOM_ZIP_PORT,
    cleanupCustomZipDir,
    downloadZip,
    extractZip,
    hashUrl,
    restoreCustomZip,
    startCustomZipServer,
    stopCustomZipServer,
} from './customZipService';

jest.mock('react-native-zip-archive', () => ({
    unzip: jest.fn(),
}));

jest.mock('@dr.pogodin/react-native-static-server', () => {
    const start = jest.fn();
    const stop = jest.fn();
    const ctor = jest.fn().mockImplementation(() => ({ start, stop }));
    return { __esModule: true, default: ctor };
});

jest.mock('../../../bridge/FileManagerBridge', () => ({
    FileManagerBridge: {
        DocumentDirectoryPath: '/docs',
        exists: jest.fn(),
        unlink: jest.fn(),
        downloadFile: jest.fn(),
    },
}));

const StaticServerMock = StaticServer as unknown as jest.Mock;
// factory가 매 호출 동일한 { start, stop } 객체를 반환하므로 한 번 생성해 핸들 확보
const serverHandle = StaticServerMock() as { start: jest.Mock; stop: jest.Mock };

const mockUnzip = unzip as jest.Mock;
const mockExists = FileManagerBridge.exists as jest.Mock;
const mockUnlink = FileManagerBridge.unlink as jest.Mock;
const mockDownloadFile = FileManagerBridge.downloadFile as jest.Mock;

const ZIP_URL = 'https://cdn.example.com/bundle.zip';
const ZIP_PATH = '/docs/custom-web/bundle.zip';
const EXTRACT_ROOT = `/docs/custom-web/webroot/${hashUrl(ZIP_URL)}`;
const ORIGIN = `http://${CUSTOM_ZIP_HOST}:${CUSTOM_ZIP_PORT}`;

describe('customZipService', () => {
    beforeEach(async () => {
        serverHandle.stop.mockResolvedValue(undefined);
        // 이전 테스트가 남긴 서버 싱글턴 초기화
        await stopCustomZipServer();
        jest.clearAllMocks();
        serverHandle.start.mockResolvedValue(ORIGIN);
        serverHandle.stop.mockResolvedValue(undefined);
        mockUnzip.mockResolvedValue(EXTRACT_ROOT);
        mockExists.mockResolvedValue(true);
        mockUnlink.mockResolvedValue(true);
        mockDownloadFile.mockResolvedValue(ZIP_PATH);
    });

    describe('hashUrl', () => {
        it('is deterministic: same input yields same output', () => {
            expect(hashUrl(ZIP_URL)).toBe(hashUrl(ZIP_URL));
        });

        it('yields different hashes for different urls', () => {
            expect(hashUrl('https://a.example.com/x.zip')).not.toBe(hashUrl('https://b.example.com/y.zip'));
        });
    });

    describe('downloadZip', () => {
        it('downloads to the fixed zip path and returns it', async () => {
            const result = await downloadZip(ZIP_URL);

            expect(mockDownloadFile).toHaveBeenCalledWith(ZIP_URL, ZIP_PATH);
            expect(result).toBe(ZIP_PATH);
        });
    });

    describe('extractZip', () => {
        it('unzips to the url-hashed extract root and returns it', async () => {
            const result = await extractZip(ZIP_PATH, ZIP_URL);

            expect(mockUnzip).toHaveBeenCalledWith(ZIP_PATH, EXTRACT_ROOT);
            expect(mockExists).toHaveBeenCalledWith(`${EXTRACT_ROOT}/index.html`);
            expect(result).toBe(EXTRACT_ROOT);
        });

        it('deletes the zip file after successful extract', async () => {
            await extractZip(ZIP_PATH, ZIP_URL);

            expect(mockUnlink).toHaveBeenCalledWith(ZIP_PATH);
        });

        it('still resolves when zip deletion fails (best-effort)', async () => {
            mockUnlink.mockRejectedValue(new Error('unlink failed'));

            await expect(extractZip(ZIP_PATH, ZIP_URL)).resolves.toBe(EXTRACT_ROOT);
        });

        it('throws when index.html is not at zip root', async () => {
            mockExists.mockResolvedValue(false);

            await expect(extractZip(ZIP_PATH, ZIP_URL)).rejects.toThrow('index.html not found at zip root');
            expect(mockUnlink).not.toHaveBeenCalled();
        });
    });

    describe('startCustomZipServer / stopCustomZipServer', () => {
        it('creates a server with the fixed host/port and returns the origin', async () => {
            const origin = await startCustomZipServer(EXTRACT_ROOT);

            expect(StaticServerMock).toHaveBeenCalledWith({
                fileDir: EXTRACT_ROOT,
                hostname: CUSTOM_ZIP_HOST,
                port: CUSTOM_ZIP_PORT,
                stopInBackground: false,
            });
            expect(origin).toBe(ORIGIN);
        });

        it('stops the previous instance before starting a new one (singleton)', async () => {
            await startCustomZipServer('/dir-a');
            expect(serverHandle.stop).not.toHaveBeenCalled();

            await startCustomZipServer('/dir-b');
            expect(serverHandle.stop).toHaveBeenCalledTimes(1);
            expect(StaticServerMock).toHaveBeenCalledTimes(2);
        });

        it('stopCustomZipServer stops a running server', async () => {
            await startCustomZipServer(EXTRACT_ROOT);
            await stopCustomZipServer();

            expect(serverHandle.stop).toHaveBeenCalledTimes(1);
        });

        it('stopCustomZipServer is a no-op when no server is running', async () => {
            await stopCustomZipServer();

            expect(serverHandle.stop).not.toHaveBeenCalled();
        });
    });

    describe('cleanupCustomZipDir', () => {
        it('unlinks the custom zip dir', async () => {
            await cleanupCustomZipDir();

            expect(mockUnlink).toHaveBeenCalledWith('/docs/custom-web');
        });

        it('ignores unlink errors (best-effort)', async () => {
            mockUnlink.mockRejectedValue(new Error('unlink failed'));

            await expect(cleanupCustomZipDir()).resolves.toBeUndefined();
        });
    });

    describe('restoreCustomZip', () => {
        it('starts the server and returns the origin when index.html exists', async () => {
            const result = await restoreCustomZip(EXTRACT_ROOT);

            expect(mockExists).toHaveBeenCalledWith(`${EXTRACT_ROOT}/index.html`);
            expect(result).toBe(ORIGIN);
        });

        it('returns null without starting the server when index.html is missing', async () => {
            mockExists.mockResolvedValue(false);

            const result = await restoreCustomZip(EXTRACT_ROOT);

            expect(result).toBeNull();
            expect(StaticServerMock).not.toHaveBeenCalled();
        });

        it('returns null instead of throwing when server start fails', async () => {
            serverHandle.start.mockRejectedValue(new Error('port in use'));

            await expect(restoreCustomZip(EXTRACT_ROOT)).resolves.toBeNull();
        });
    });
});

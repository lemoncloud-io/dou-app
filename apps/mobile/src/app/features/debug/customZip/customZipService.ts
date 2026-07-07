import StaticServer from '@dr.pogodin/react-native-static-server';
import { unzip } from 'react-native-zip-archive';

import { FileManagerBridge } from '../../../bridge/FileManagerBridge';

export const CUSTOM_ZIP_PORT = 8890;
export const CUSTOM_ZIP_HOST = '127.0.0.1';

const getCustomZipDir = () => `${FileManagerBridge.DocumentDirectoryPath}/custom-web`;
const getZipDownloadPath = () => `${getCustomZipDir()}/bundle.zip`;
const getExtractRoot = (zipUrl: string) => `${getCustomZipDir()}/webroot/${hashUrl(zipUrl)}`;

/** 결정적 djb2(xor) 해시 — zip URL별 압축해제 루트 격리용 (crypto 의존성 없음) */
export const hashUrl = (url: string): string => {
    let hash = 5381;
    for (let i = 0; i < url.length; i += 1) {
        hash = (hash * 33) ^ url.charCodeAt(i);
    }
    // >>> 0: int32 → unsigned 변환으로 음수 hex 방지
    return (hash >>> 0).toString(16);
};

export const downloadZip = async (zipUrl: string): Promise<string> => {
    const zipPath = getZipDownloadPath();
    await FileManagerBridge.downloadFile(zipUrl, zipPath);
    return zipPath;
};

export const extractZip = async (zipPath: string, zipUrl: string): Promise<string> => {
    const extractRoot = getExtractRoot(zipUrl);
    await unzip(zipPath, extractRoot);

    const hasIndexHtml = await FileManagerBridge.exists(`${extractRoot}/index.html`);
    // 규칙: index.html은 반드시 zip 루트에 위치 (하위 디렉터리 스캔 없음)
    if (!hasIndexHtml) throw new Error('index.html not found at zip root');

    // 압축해제 성공 후 zip 원본 삭제 — best-effort, 실패 무시
    await FileManagerBridge.unlink(zipPath).catch(() => undefined);
    return extractRoot;
};

let serverInstance: StaticServer | null = null;

export const startCustomZipServer = async (fileDir: string): Promise<string> => {
    if (serverInstance) {
        await serverInstance.stop();
        serverInstance = null;
    }
    const server = new StaticServer({
        fileDir,
        hostname: CUSTOM_ZIP_HOST,
        port: CUSTOM_ZIP_PORT,
        stopInBackground: false,
    });
    const origin = await server.start();
    serverInstance = server;
    return origin;
};

export const stopCustomZipServer = async (): Promise<void> => {
    if (!serverInstance) return;
    await serverInstance.stop();
    serverInstance = null;
};

export const cleanupCustomZipDir = async (): Promise<void> => {
    // native 측에서 recursive 삭제 — best-effort, 실패 무시
    await FileManagerBridge.unlink(getCustomZipDir()).catch(() => undefined);
};

/**
 * 앱 재시작 시 persist된 localRoot로 서버 복원.
 * 절대 throw하지 않음 — 실패(루트 소실/서버 기동 실패)는 null 반환,
 * boot gate가 null을 '기본 웹으로 폴백'으로 처리한다.
 */
export const restoreCustomZip = async (localRoot: string): Promise<string | null> => {
    try {
        const hasIndexHtml = await FileManagerBridge.exists(`${localRoot}/index.html`);
        if (!hasIndexHtml) return null;
        return await startCustomZipServer(localRoot);
    } catch {
        return null;
    }
};

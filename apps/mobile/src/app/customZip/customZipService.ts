import StaticServer from '@dr.pogodin/react-native-static-server';
import { unzip } from 'react-native-zip-archive';

import { FileManagerBridge } from '../bridge/FileManagerBridge';

export const CUSTOM_ZIP_PORT = 8890;
export const CUSTOM_ZIP_HOST = '127.0.0.1';

const getCustomZipDir = () => `${FileManagerBridge.DocumentDirectoryPath}/custom-web`;
const getZipDownloadPath = () => `${getCustomZipDir()}/bundle.zip`;
const getExtractRoot = (zipUrl: string) => `${getCustomZipDir()}/webroot/${hashUrl(zipUrl)}`;

export const hashUrl = (url: string): string => {
    let hash = 5381;
    for (let i = 0; i < url.length; i += 1) {
        hash = (hash * 33) ^ url.charCodeAt(i);
    }
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
    if (!hasIndexHtml) throw new Error('index.html not found at zip root');

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
    await FileManagerBridge.unlink(getCustomZipDir()).catch(() => undefined);
};

export const restoreCustomZip = async (localRoot: string): Promise<string | null> => {
    try {
        const hasIndexHtml = await FileManagerBridge.exists(`${localRoot}/index.html`);
        if (!hasIndexHtml) return null;
        return await startCustomZipServer(localRoot);
    } catch {
        return null;
    }
};

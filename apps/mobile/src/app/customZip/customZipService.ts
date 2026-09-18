import StaticServer from '@dr.pogodin/react-native-static-server';
import { unzip } from 'react-native-zip-archive';

import { FileManagerBridge } from '../bridge/FileManagerBridge';

export const CUSTOM_ZIP_PORT = 8890;
export const CUSTOM_ZIP_HOST = '127.0.0.1';

const getCustomZipDir = () => `${FileManagerBridge.DocumentDirectoryPath}/custom-web`;
const getZipDownloadPath = () => `${getCustomZipDir()}/bundle.zip`;
const getExtractRoot = (zipUrl: string) => `${getCustomZipDir()}/webroot/${hashUrl(zipUrl)}`;

/** Deterministic djb2 (xor) hash — used to isolate the extraction root per zip URL (no crypto dependency) */
export const hashUrl = (url: string): string => {
    let hash = 5381;
    for (let i = 0; i < url.length; i += 1) {
        hash = (hash * 33) ^ url.charCodeAt(i);
    }
    // >>> 0: converts int32 → unsigned to avoid a negative hex string
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
    // Rule: index.html must be located at the zip root (no subdirectory scanning)
    if (!hasIndexHtml) throw new Error('index.html not found at zip root');

    // Delete the original zip after a successful extraction — best-effort, ignore failures
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
    // Recursive delete on the native side — best-effort, ignore failures
    await FileManagerBridge.unlink(getCustomZipDir()).catch(() => undefined);
};

/**
 * Restores the server from the persisted localRoot on app restart.
 * Never throws — a failure (missing root / server start failure) returns null,
 * which the boot gate treats as "fall back to the default web".
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

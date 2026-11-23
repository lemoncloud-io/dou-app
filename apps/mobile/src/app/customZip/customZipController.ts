import { useDebugRuntimeStore } from '../stores/debugRuntimeStore';
import { useDebugSettingsStore } from '../stores/debugSettingsStore';
import {
    cleanupCustomZipDir,
    downloadZip,
    extractZip,
    startCustomZipServer,
    stopCustomZipServer,
} from './customZipService';

export interface CustomZipState {
    localRoot: string | null;
    serverUrl: string | null;
}

export const readCustomZipState = (): CustomZipState => {
    const { customZipLocalRoot, customZipServerUrl } = useDebugSettingsStore.getState();
    return { localRoot: customZipLocalRoot, serverUrl: customZipServerUrl };
};

export const applyCustomZip = async (zipUrl: string): Promise<string> => {
    const settings = useDebugSettingsStore.getState();
    const wasActive = Boolean(settings.customZipLocalRoot || settings.customZipServerUrl);
    try {
        if (wasActive) {
            await stopCustomZipServer();
            settings.setCustomZipServerUrl(null);
            settings.setCustomZipLocalRoot(null);
        }
        await cleanupCustomZipDir();
        const zipPath = await downloadZip(zipUrl);
        const extractRoot = await extractZip(zipPath, zipUrl);
        const origin = await startCustomZipServer(extractRoot);

        settings.setCustomZipLocalRoot(extractRoot);
        settings.setCustomZipServerUrl(origin);
        useDebugRuntimeStore.getState().requestWebViewReload();
        return origin;
    } catch (error) {
        if (wasActive) useDebugRuntimeStore.getState().requestWebViewReload();
        throw error;
    }
};

export const disableCustomZip = async (): Promise<void> => {
    await stopCustomZipServer();
    const { setCustomZipLocalRoot, setCustomZipServerUrl } = useDebugSettingsStore.getState();
    setCustomZipServerUrl(null);
    setCustomZipLocalRoot(null);
    await cleanupCustomZipDir();
    useDebugRuntimeStore.getState().requestWebViewReload();
};

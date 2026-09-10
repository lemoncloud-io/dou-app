import { useDebugRuntimeStore } from '../stores/debugRuntimeStore';
import { useDebugSettingsStore } from '../stores/debugSettingsStore';
import {
    cleanupCustomZipDir,
    downloadZip,
    extractZip,
    startCustomZipServer,
    stopCustomZipServer,
} from './customZipService';

/**
 * Apply/disable a custom web zip, without React.
 *
 * Was `useCustomZipLoader`, a hook the app's 환경설정 screen owned. ADR-0080 결정 11 moved the
 * controls to the web, so the caller is now a bridge handler — and a handler cannot hold a hook.
 * The status a screen used to keep in `useState` belongs to whoever is drawing buttons, which is
 * the web now; this returns the outcome instead.
 *
 * The ordering below is the part worth preserving verbatim: the store is only updated AFTER the
 * local server resolves, so a failed apply leaves the default web in place rather than a root that
 * was already deleted.
 */
export interface CustomZipState {
    localRoot: string | null;
    serverUrl: string | null;
}

export const readCustomZipState = (): CustomZipState => {
    const { customZipLocalRoot, customZipServerUrl } = useDebugSettingsStore.getState();
    return { localRoot: customZipLocalRoot, serverUrl: customZipServerUrl };
};

/** Resolves with the serving origin, or throws with why it failed. */
export const applyCustomZip = async (zipUrl: string): Promise<string> => {
    const settings = useDebugSettingsStore.getState();
    const wasActive = Boolean(settings.customZipLocalRoot || settings.customZipServerUrl);
    try {
        // Replacement case: take the server down and clear the active state BEFORE deleting the
        // webroot being served. Otherwise a failed new zip leaves the store pointing at a root
        // that is already gone.
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
        // A failed replacement already took the previous custom server down, so reload rather than
        // sitting on a dead origin.
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

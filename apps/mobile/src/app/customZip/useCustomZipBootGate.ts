import { useEffect, useRef, useState } from 'react';

import { useDebugSettingsStore } from '../stores/debugSettingsStore';
import { restoreCustomZip } from './customZipService';

/**
 * A gate that restores the local server from the persisted customZipLocalRoot on app boot.
 *
 * RACE CONTRACT: customZipServerUrl is never set before the server's start Promise resolves.
 * isRestoringCustomZip stays true until the restore has settled.
 */
export const useCustomZipBootGate = (): { isRestoringCustomZip: boolean } => {
    // Lazily compute the initial value to avoid a false → true flash when localRoot is present
    const [isRestoringCustomZip, setIsRestoringCustomZip] = useState<boolean>(
        () => !!useDebugSettingsStore.getState().customZipLocalRoot
    );
    const hasRunRef = useRef(false);

    useEffect(() => {
        if (hasRunRef.current) return;
        hasRunRef.current = true;

        const localRoot = useDebugSettingsStore.getState().customZipLocalRoot;
        if (!localRoot) {
            setIsRestoringCustomZip(false);
            return;
        }

        // restoreCustomZip never throws (failure = null)
        restoreCustomZip(localRoot)
            .then(origin => {
                const { setCustomZipLocalRoot, setCustomZipServerUrl } = useDebugSettingsStore.getState();
                if (origin) {
                    setCustomZipServerUrl(origin);
                    return;
                }
                // stale root — clear the persisted root so future boots fall back to the default web
                setCustomZipLocalRoot(null);
            })
            .finally(() => setIsRestoringCustomZip(false));
    }, []);

    return { isRestoringCustomZip };
};

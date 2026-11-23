import { useEffect, useRef, useState } from 'react';

import { useDebugSettingsStore } from '../stores/debugSettingsStore';
import { restoreCustomZip } from './customZipService';

export const useCustomZipBootGate = (): { isRestoringCustomZip: boolean } => {
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

        restoreCustomZip(localRoot)
            .then(origin => {
                const { setCustomZipLocalRoot, setCustomZipServerUrl } = useDebugSettingsStore.getState();
                if (origin) {
                    setCustomZipServerUrl(origin);
                    return;
                }
                setCustomZipLocalRoot(null);
            })
            .finally(() => setIsRestoringCustomZip(false));
    }, []);

    return { isRestoringCustomZip };
};

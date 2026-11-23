import { runtime } from '@chatic/runtime';
import { useCallback, useEffect } from 'react';

import { useUpdateStore } from '../stores';

export const useAppUpdate = () => {
    const set = useUpdateStore(s => s.set);

    useEffect(() => {
        const selfUpdate = runtime.appShell.selfUpdate;
        if (!selfUpdate) return;
        return selfUpdate.onStatus(data => {
            set({ status: data.status, version: data.version, percent: data.percent });
        });
    }, [set]);

    const startDownload = useCallback(() => runtime.appShell.selfUpdate?.startDownload(), []);
    const restart = useCallback(() => runtime.appShell.selfUpdate?.restart(), []);

    return { startDownload, restart };
};

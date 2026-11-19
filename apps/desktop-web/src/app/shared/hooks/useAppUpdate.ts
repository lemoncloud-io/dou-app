import { runtime } from '@chatic/runtime';
import { useCallback, useEffect } from 'react';

import { useUpdateStore } from '../stores';

/**
 * Desktop auto-update wiring. Subscribes to the updater's status announcements and
 * mirrors them into useUpdateStore, and exposes the ask-first actions: the user
 * agrees to download, then to restart. No-op unless the frame updates itself
 * (the host's `appShell` port, `selfUpdate`) — in a plain browser, for one.
 */
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

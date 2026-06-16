import { useCallback, useEffect } from 'react';

import { isNative, webClient } from '@chatic/bridges';

import { useUpdateStore } from '../stores';

/**
 * Desktop auto-update wiring. Subscribes to the shell's OnUpdateStatus event and
 * mirrors it into useUpdateStore, and exposes the ask-first actions: the user
 * agrees to download (StartUpdateDownload) then to restart (RestartToUpdate).
 * No-op in a plain browser (isNative() false).
 */
export const useAppUpdate = () => {
    const set = useUpdateStore(s => s.set);

    useEffect(() => {
        if (!isNative()) return;
        return webClient.onEvent('OnUpdateStatus', message => {
            const data = message.data;
            if (!data) return;
            set({ status: data.status, version: data.version, percent: data.percent });
        });
    }, [set]);

    const startDownload = useCallback(() => webClient.post('StartUpdateDownload', {}), []);
    const restart = useCallback(() => webClient.post('RestartToUpdate', {}), []);

    return { startDownload, restart };
};

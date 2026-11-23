import { useEffect } from 'react';

import { runtimeConnection } from '@chatic/runtime-client';

let pendingWithdrawal: ReturnType<typeof setTimeout> | null = null;

const cancelPendingWithdrawal = (): void => {
    if (pendingWithdrawal === null) return;
    clearTimeout(pendingWithdrawal);
    pendingWithdrawal = null;
};

export const useBackgroundClouds = (cids: readonly string[] | null): void => {
    const key = cids === null ? null : cids.join('\n');

    useEffect(() => {
        if (key === null) return;
        runtimeConnection().setBackgroundClouds(key ? key.split('\n') : []);
    }, [key]);

    useEffect(() => {
        cancelPendingWithdrawal();
        return () => {
            pendingWithdrawal = setTimeout(() => {
                pendingWithdrawal = null;
                runtimeConnection().setBackgroundClouds([]);
            }, 0);
        };
    }, []);
};

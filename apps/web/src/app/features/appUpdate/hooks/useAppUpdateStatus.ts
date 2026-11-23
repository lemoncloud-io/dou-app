import { useCallback, useEffect } from 'react';
import { create } from 'zustand';
import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime';

import { useAppForeground } from '../../../bridge/useAppForeground';

export interface AppUpdateStatus {
    updateAvailable: boolean;
    latestVersion: string;
}

const NO_UPDATE: AppUpdateStatus = { updateAvailable: false, latestVersion: '' };

interface AppUpdateStore extends AppUpdateStatus {
    setStatus: (status: AppUpdateStatus) => void;
}

export const useAppUpdateStore = create<AppUpdateStore>(set => ({
    ...NO_UPDATE,
    setStatus: status => set(status),
}));

export const useAppUpdateStatus = (): AppUpdateStatus => {
    const updateAvailable = useAppUpdateStore(state => state.updateAvailable);
    const latestVersion = useAppUpdateStore(state => state.latestVersion);

    const check = useCallback(async () => {
        const storeUpdate = runtime.appShell.storeUpdate;
        if (!storeUpdate) return;
        try {
            const next = await storeUpdate.check();
            const previous = useAppUpdateStore.getState().updateAvailable;
            if (next.updateAvailable !== previous) {
                logger.info('VERSION', `app update ${next.updateAvailable ? 'available' : 'no longer offered'}`, {
                    updateAvailable: next.updateAvailable,
                    latestVersion: next.latestVersion,
                });
            }
            useAppUpdateStore.getState().setStatus(next);
        } catch (error) {
            logger.warn('VERSION', 'app update check failed', { error });
        }
    }, []);

    useEffect(() => {
        void check();
    }, [check]);

    useAppForeground(() => {
        void check();
    });

    return { updateAvailable, latestVersion };
};

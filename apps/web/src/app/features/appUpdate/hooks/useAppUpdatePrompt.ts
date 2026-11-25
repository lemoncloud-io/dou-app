import { useCallback } from 'react';

import { runtime } from '@chatic/runtime-react';

import { useAppUpdateStatus } from './useAppUpdateStatus';

export const useAppUpdatePrompt = () => {
    const { updateAvailable, latestVersion } = useAppUpdateStatus();
    const dismissedUpdateVersion = runtime.settings.useConfigValue<string>('ui.dismissedUpdateVersion') ?? '';

    const open = updateAvailable && latestVersion !== dismissedUpdateVersion;

    const dismiss = useCallback(() => {
        runtime.settings.set('ui.dismissedUpdateVersion', latestVersion, { lane: 'local' });
    }, [latestVersion]);

    const goToStore = useCallback(() => {
        runtime.appShell.storeUpdate?.openStore();
        runtime.settings.set('ui.dismissedUpdateVersion', latestVersion, { lane: 'local' });
    }, [latestVersion]);

    return { open, dismiss, goToStore };
};

import { useCallback } from 'react';

import { appBridge } from '../../../bridge';
import { usePreferenceStore } from '../../../stores/usePreferenceStore';
import { useAppUpdateStatus } from './useAppUpdateStatus';

/**
 * Drives the update-prompt dialog on top of the shared update status: opens only when a live
 * update exists AND the user hasn't already dismissed that exact version.
 */
export const useAppUpdatePrompt = () => {
    const { updateAvailable, latestVersion } = useAppUpdateStatus();
    const dismissedUpdateVersion = usePreferenceStore(state => state.dismissedUpdateVersion);
    const dismissUpdate = usePreferenceStore(state => state.dismissUpdate);

    // Derived rather than held in local state: dismissing persists the version, which closes the
    // dialog on the next render and keeps it closed for every later check of the same version —
    // no separate "already shown" bookkeeping that could drift from the persisted dismissal.
    const open = updateAvailable && latestVersion !== dismissedUpdateVersion;

    // Any way the dialog closes (Later, ESC, outside click) counts as "dismissed for this
    // version" — re-nagging on every foreground return would be worse than under-nagging.
    const dismiss = useCallback(() => {
        dismissUpdate(latestVersion);
    }, [dismissUpdate, latestVersion]);

    const goToStore = useCallback(() => {
        appBridge.openStore();
        dismissUpdate(latestVersion);
    }, [dismissUpdate, latestVersion]);

    return { open, dismiss, goToStore };
};

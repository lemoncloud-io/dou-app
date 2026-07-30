import { useCallback, useEffect, useState } from 'react';
import { isNative } from '@chatic/bridges';

import { appBridge } from '../../../bridge';
import { useAppForeground } from '../../../bridge/useAppForeground';
import { usePreferenceStore } from '../../../stores/usePreferenceStore';
import { IS_APP_UPDATE_CHECK_ENABLED } from '../featureFlag';

interface AppUpdatePromptState {
    open: boolean;
    latestVersion: string;
}

const CLOSED: AppUpdatePromptState = { open: false, latestVersion: '' };

/**
 * Drives the update-prompt dialog: checks on mount and on every foreground return,
 * and opens the dialog only when a live update exists AND the user hasn't already
 * dismissed that exact version. Non-native (plain browser) never calls the bridge.
 */
export const useAppUpdatePrompt = () => {
    const dismissUpdate = usePreferenceStore(state => state.dismissUpdate);
    const [state, setState] = useState<AppUpdatePromptState>(CLOSED);

    // Reads dismissedUpdateVersion as a point-in-time snapshot rather than subscribing to it. A
    // reactive subscription would change `check`'s identity on every dismiss/update, which would
    // re-trigger the mount effect below and fire a redundant extra bridge round-trip right after
    // every dismiss/update.
    const check = useCallback(async () => {
        if (!IS_APP_UPDATE_CHECK_ENABLED || !isNative()) return;
        try {
            const response = await appBridge.checkAppUpdate();
            const { updateAvailable, latestVersion } = response.data;
            const dismissedUpdateVersion = usePreferenceStore.getState().dismissedUpdateVersion;
            if (updateAvailable && latestVersion !== dismissedUpdateVersion) {
                setState({ open: true, latestVersion });
            }
        } catch {
            // Update check is best-effort; a failed/unsupported bridge call just skips the prompt.
        }
    }, []);

    useEffect(() => {
        void check();
    }, [check]);

    useAppForeground(() => {
        void check();
    });

    // Any way the dialog closes (Later, ESC, outside click) counts as "dismissed for this
    // version" — re-nagging on every foreground return would be worse than under-nagging.
    const dismiss = useCallback(() => {
        dismissUpdate(state.latestVersion);
        setState(CLOSED);
    }, [dismissUpdate, state.latestVersion]);

    const goToStore = useCallback(() => {
        appBridge.openStore();
        dismissUpdate(state.latestVersion);
        setState(CLOSED);
    }, [dismissUpdate, state.latestVersion]);

    return { open: state.open, dismiss, goToStore };
};

import { useCallback, useEffect } from 'react';
import { create } from 'zustand';
import { isNative, logger } from '@chatic/bridges';

import { appBridge } from '../../../bridge';
import { useAppForeground } from '../../../bridge/useAppForeground';

export interface AppUpdateStatus {
    /** True only when the native live-version lookup found a newer store build (iOS only today). */
    updateAvailable: boolean;
    /** Live store version behind `updateAvailable`; '' until the first successful check. */
    latestVersion: string;
}

const NO_UPDATE: AppUpdateStatus = { updateAvailable: false, latestVersion: '' };

interface AppUpdateStore extends AppUpdateStatus {
    setStatus: (status: AppUpdateStatus) => void;
}

/**
 * Last native update-check result, shared by every consumer so the prompt and the my-page row
 * can never disagree.
 *
 * The boot-time `CHATIC_APP_SHOULD_UPDATE` injection is deliberately NOT a source here: on a cold
 * start the App Store lookup only resolves after the WebView is created, so the injected value is
 * always 'false', and the follow-up OnUpdateDeviceInfo push is dropped whenever it lands before a
 * `useDeviceInfo()` consumer has populated the device-info store. The bridge check is the one
 * source that is correct at the moment it is asked.
 */
export const useAppUpdateStore = create<AppUpdateStore>(set => ({
    ...NO_UPDATE,
    setStatus: status => set(status),
}));

/**
 * Checks for an app update on mount and on every foreground return, publishes the result to the
 * shared store, and returns the current status. Safe to mount from several places at once — the
 * native side caches a successful lookup, so the extra calls are cheap. Non-native (plain browser)
 * never calls the bridge and stays on the "no update" default.
 */
export const useAppUpdateStatus = (): AppUpdateStatus => {
    const updateAvailable = useAppUpdateStore(state => state.updateAvailable);
    const latestVersion = useAppUpdateStore(state => state.latestVersion);

    const check = useCallback(async () => {
        if (!isNative()) return;
        try {
            const response = await appBridge.checkAppUpdate();
            const next = {
                updateAvailable: response.data.updateAvailable,
                latestVersion: response.data.latestVersion,
            };
            // Only on the transition, not on every check: this runs on mount and on every
            // foreground return, so reporting the standing state would file the same line all day.
            // The edge is what answers both shapes of the report — "the update prompt never
            // appeared" and "it keeps appearing after I updated" (ADR-0075).
            const previous = useAppUpdateStore.getState().updateAvailable;
            if (next.updateAvailable !== previous) {
                logger.info('VERSION', `app update ${next.updateAvailable ? 'available' : 'no longer offered'}`, {
                    updateAvailable: next.updateAvailable,
                    latestVersion: next.latestVersion,
                });
            }
            useAppUpdateStore.getState().setStatus(next);
        } catch (error) {
            // Update check is best-effort; a failed/unsupported bridge call keeps the last status.
            // Recorded because the last status is what the UI keeps showing — a check that never
            // succeeds looks exactly like "no update available".
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

import { useEffect } from 'react';

import { isNative, webClient } from '@chatic/bridges';

import { useNotificationPrefsStore } from '../stores';

/**
 * Mirror the renderer's notification prefs (global switch + snooze + quiet
 * hours) to the Electron main process. Cross-cloud FCM banners are raised by
 * main directly — without this mirror they ignore DND entirely and buzz the
 * dock during quiet hours. Sends the current snapshot on mount and again on
 * every store change; main evaluates DND at show time (so a quiet-hours
 * boundary crossing needs no re-send). No-op in a plain browser.
 */
export const useSyncNotificationPrefsToShell = (): void => {
    useEffect(() => {
        if (!isNative()) return;
        // Fire-and-forget: an older shell without the handler just leaves banners ungated.
        const send = (state: {
            desktopEnabled: boolean;
            snoozeUntil: number | null;
            quietHours: { start: string; end: string } | null;
        }) => {
            webClient.post({
                type: 'SetNotificationPrefs',
                data: {
                    enabled: state.desktopEnabled,
                    snoozeUntil: state.snoozeUntil,
                    quietHours: state.quietHours,
                },
            });
        };
        send(useNotificationPrefsStore.getState());
        return useNotificationPrefsStore.subscribe(send);
    }, []);
};

import { useEffect, useRef } from 'react';
import { useMatch } from 'react-router-dom';

import { useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';

/**
 * Global, route-derived device viewing notifier. Mounted once in UnifiedLayout (inside the
 * RouterProvider) so a single place observes every private-route transition — robust to the
 * component remounts a per-page hook would miss, and it also sees the channel→list exit.
 *
 * Viewing is scoped to the channel room only; settings/list/other routes clear it. Each real
 * change fires exactly one device.sync (fire-and-forget), deduped via a ref so re-render churn
 * does not re-notify an unchanged target.
 */
export const useDeviceSync = (): void => {
    const match = useMatch('/channels/:channelId/room');
    const channelId = match?.params.channelId ?? '';
    const { device } = useRuntimeRepositories();
    const { isVerified } = useSocketState();

    // The viewingId we last notified. '' = "no channel"; null = nothing sent yet (or the
    // connection dropped, forcing a re-assert once auth returns).
    const lastNotifiedRef = useRef<string | null>(null);

    useEffect(() => {
        if (!isVerified) {
            // The socket dropped; the runtime's reconnect re-saves device state but never the
            // viewing target, so re-assert it after the next re-auth.
            lastNotifiedRef.current = null;
            return;
        }
        if (lastNotifiedRef.current === channelId) return;

        // First settle on a non-channel route: nothing was ever set, so there is nothing to clear.
        if (lastNotifiedRef.current === null && channelId === '') {
            lastNotifiedRef.current = '';
            return;
        }

        lastNotifiedRef.current = channelId;
        device.syncDevice(channelId ? 'channel' : '', channelId);
    }, [device, isVerified, channelId]);
};

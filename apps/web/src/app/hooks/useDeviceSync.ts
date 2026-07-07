import { useEffect, useRef } from 'react';
import { useMatch } from 'react-router-dom';

import { useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';

import { useAppVisibility } from '../bridge';

/** Presence status the server holds for this device: green = foreground, yellow = background. */
type PresenceStatus = 'green' | 'yellow';

const toStatus = (isForeground: boolean): PresenceStatus => (isForeground ? 'green' : 'yellow');

/**
 * Global device.sync owner — route-derived viewing target + visibility-derived presence
 * status. Mounted once in UnifiedLayout (inside the RouterProvider) so a single place
 * observes every private-route transition — robust to the component remounts a per-page
 * hook would miss, and it also sees the channel→list exit.
 *
 * Viewing is scoped to the channel room only; settings/list/other routes clear it. Each real
 * change fires exactly one device.sync (fire-and-forget), deduped via a ref so re-render churn
 * does not re-notify an unchanged target.
 *
 * Status transitions send immediately without gating on isVerified: device.sync is a
 * fire-and-forget `send` (not the self-healing request path), so a send on a dead socket is
 * silently lost — the verified rising edge below re-asserts the current status, which also
 * covers the very first green after app start.
 */
export const useDeviceSync = (): void => {
    const match = useMatch('/channels/:channelId/room');
    const channelId = match?.params.channelId ?? '';
    const { device } = useRuntimeRepositories();
    const { isVerified } = useSocketState();

    // The viewingId we last notified. '' = "no channel"; null = nothing sent yet (or the
    // connection dropped, forcing a re-assert once auth returns).
    const lastNotifiedRef = useRef<string | null>(null);

    // Current visibility-derived status. Initialized from the document so a session that
    // starts hidden (e.g. a restored background tab) does not claim green.
    const statusRef = useRef<PresenceStatus>(document.visibilityState === 'hidden' ? 'yellow' : 'green');
    // The status we last sent while verified; null = unsent or possibly lost (re-assert needed).
    const lastSentStatusRef = useRef<PresenceStatus | null>(null);

    useAppVisibility(isForeground => {
        const status = toStatus(isForeground);
        statusRef.current = status;
        if (lastSentStatusRef.current === status) return;
        // Optimistic send even when unverified — harmless on a dead socket. Only a verified
        // send is recorded, so a possibly-lost one is re-asserted on the next rising edge.
        if (isVerified) lastSentStatusRef.current = status;
        device.syncStatus(status);
    });

    useEffect(() => {
        if (!isVerified) {
            // The socket dropped; the runtime's reconnect re-saves device state but never the
            // viewing target or status, so re-assert both after the next re-auth.
            lastNotifiedRef.current = null;
            lastSentStatusRef.current = null;
            return;
        }

        // Catch-up: (re)assert the current presence once per verified session — covers app
        // start (first green) and sends lost while disconnected.
        if (lastSentStatusRef.current !== statusRef.current) {
            lastSentStatusRef.current = statusRef.current;
            device.syncStatus(statusRef.current);
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

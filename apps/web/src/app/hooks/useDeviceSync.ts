import { useCallback, useEffect, useRef } from 'react';
import { useMatch } from 'react-router-dom';

import { useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';

import { useAppVisibility } from '../bridge';
import { ROUTES } from '../routes/paths';

/** Presence status the server holds for this device: green = foreground, yellow = background. */
type PresenceStatus = 'green' | 'yellow';

const toStatus = (isForeground: boolean): PresenceStatus => (isForeground ? 'green' : 'yellow');

/**
 * Global device.sync owner — route-derived viewing target + visibility-derived presence
 * status. Mounted once in UnifiedLayout (inside the RouterProvider) so a single place
 * observes every private-route transition — robust to the component remounts a per-page
 * hook would miss, and it also sees the channel→list exit.
 *
 * Viewing covers the channel room AND its thread — a thread is the same room seen from another
 * angle, so a reader inside one is "in" the channel and the server must keep filtering its pushes
 * out (docs/specs/mobile/push-notification-scenarios.md §3.2). Settings/list/other routes clear it.
 * Backgrounding the app also clears the viewing pair (the server must not show this device "in" a
 * room while it is hidden), and returning to the foreground restores the current room. Each real
 * change fires exactly one device.sync (fire-and-forget), deduped via a ref so re-render churn
 * does not re-notify an unchanged target.
 *
 * Every device.sync send is gated on a connected socket (isVerified): device.sync is a
 * fire-and-forget `send` (not the self-healing request path), so a send on a dead socket would be
 * silently lost. While disconnected the hook only records the intended status/viewing in refs; the
 * verified rising edge (the catch-up effect below) re-asserts both once connected — which also
 * covers the very first green after app start.
 */
export const useDeviceSync = (): void => {
    const roomMatch = useMatch(ROUTES.channels.room(':channelId'));
    const threadMatch = useMatch(ROUTES.channels.thread(':channelId', ':rootNo'));
    // Room and thread report the same viewing pair, so the hop between them is not a change at all —
    // syncViewing dedups it away and the server never sees a gap it could push into.
    const channelId = roomMatch?.params.channelId ?? threadMatch?.params.channelId ?? '';
    const { device } = useRuntimeRepositories();
    const { isVerified } = useRuntimeSocketState();

    // The viewingId we last notified. '' = "no channel / cleared while backgrounded"; null =
    // nothing sent yet (or the connection dropped, forcing a re-assert once auth returns).
    const lastNotifiedRef = useRef<string | null>(null);

    // Current visibility-derived status. Initialized from the document so a session that
    // starts hidden (e.g. a restored background tab) does not claim green.
    const statusRef = useRef<PresenceStatus>(document.visibilityState === 'hidden' ? 'yellow' : 'green');
    // The status we last sent while verified; null = unsent or possibly lost (re-assert needed).
    const lastSentStatusRef = useRef<PresenceStatus | null>(null);
    // Foreground gates the viewing target: while backgrounded the effective target collapses to ''
    // so the server does not keep showing this device inside a room it can no longer see.
    const isForegroundRef = useRef(document.visibilityState !== 'hidden');

    // (Re)assert the effective viewing target — the current room while foregrounded, cleared while
    // backgrounded — sending only on a real change. Gated on verified (like the route catch-up
    // below): sends lost on a dead socket are re-asserted once auth returns.
    const syncViewing = useCallback((): void => {
        if (!isVerified) return;
        const viewingId = isForegroundRef.current ? channelId : '';
        if (lastNotifiedRef.current === viewingId) return;
        // First settle with nothing ever set and nothing to view: record the empty state without
        // emitting a redundant clear (the server default is already empty).
        if (lastNotifiedRef.current === null && viewingId === '') {
            lastNotifiedRef.current = '';
            return;
        }
        lastNotifiedRef.current = viewingId;
        device.syncDevice(viewingId ? 'channel' : '', viewingId);
    }, [device, isVerified, channelId]);

    useAppVisibility(isForeground => {
        const status = toStatus(isForeground);
        statusRef.current = status;
        isForegroundRef.current = isForeground;

        // Only sync while the socket is connected. When disconnected we just record the intent in
        // the refs above; the verified catch-up effect below re-asserts status + viewing on reconnect.
        if (!isVerified) return;

        // Presence status: send on a real change and record it as delivered (we are verified here).
        if (lastSentStatusRef.current !== status) {
            lastSentStatusRef.current = status;
            device.syncStatus(status);
        }

        // Viewing follows visibility: clear the pair on background, restore the current room on
        // foreground. syncViewing self-dedups, so a repeat same-direction signal is a no-op.
        syncViewing();
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

        syncViewing();
    }, [device, isVerified, syncViewing]);
};

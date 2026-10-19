import { useRef } from 'react';

import { runtime } from '@chatic/app-runtime';

import { useAppForeground } from '../bridge';

// Rapid foreground signals (native message + web visibilitychange can both land) shouldn't churn
// the sockets — coalesce kicks into one attempt per window. Mirrors desktop-web's throttle.
const KICK_THROTTLE_MS = 5_000;

/**
 * Foreground wake kick for wedged sockets. After a WebView
 * suspension the socket can be a half-open zombie; without this, recovery waits for the keep-alive
 * loop to miss two pongs (~40-80s) before reconnect + re-auth run. On every app-foreground signal
 * this force-recycles any bound-but-unverified slot immediately (and re-seeds a terminally-expired
 * controller), and pings every slot that still reads verified, recycling the ones that stay silent
 * for three seconds — a zombie keeps the flags of the handshake it completed before the suspension.
 *
 * The helper no-ops per slot that is not yet booted, so mounting this before login / before
 * RuntimeConnectionHost finishes booting is inert. The same signal asks every background cloud for
 * what it missed while suspended.
 */
export const useSocketWakeRecovery = (): void => {
    const lastKickRef = useRef(0);

    useAppForeground(() => {
        const now = Date.now();
        if (now - lastKickRef.current < KICK_THROTTLE_MS) return;
        lastKickRef.current = now;
        void runtime.connection.recoverSocketsOnResume();
        // The clouds the user is not looking at poll on a timer that froze with the app, and their
        // pushes went nowhere meanwhile, so each one whose socket reads verified asks for its delta
        // now, without waiting for the probe above. On a socket that died without knowing it, that
        // request fails when the probe recycles the slot — the same exposure this app's own
        // foreground refresh has — and the cloud asks again once its slot verifies.
        runtime.sync.refreshBackgroundClouds();
    });
};

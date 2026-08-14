import { useRef } from 'react';

import { recoverUnverifiedSockets } from '@chatic/app-runtime';

import { useAppForeground } from '../bridge';

// Rapid foreground signals (native message + web visibilitychange can both land) shouldn't churn
// the sockets — coalesce kicks into one attempt per window. Mirrors desktop-web's throttle.
const KICK_THROTTLE_MS = 5_000;

/**
 * Foreground wake kick for wedged sockets (2026-08 session audit §7 Phase 1). After a WebView
 * suspension the socket can be a half-open zombie; without this, recovery waits for the keep-alive
 * loop to miss two pongs (~40-80s) before reconnect + re-auth run. On every app-foreground signal
 * this force-recycles any bound-but-unverified slot immediately (and re-seeds a terminally-expired
 * controller), so the room/list refetches that also fire on foreground hit a live session instead
 * of racing a dead one.
 *
 * The helper itself no-ops per slot when the socket is verified or not yet booted, so mounting this
 * before login / before RuntimeConnectionHost finishes booting is inert.
 */
export const useSocketWakeRecovery = (): void => {
    const lastKickRef = useRef(0);

    useAppForeground(() => {
        const now = Date.now();
        if (now - lastKickRef.current < KICK_THROTTLE_MS) return;
        lastKickRef.current = now;
        void recoverUnverifiedSockets();
    });
};

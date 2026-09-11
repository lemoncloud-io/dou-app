/**
 * `hooks/useSocketWakeRecovery.ts`
 * - Kicks a wedged relay socket when the console comes back, instead of waiting out the keep-alive.
 *
 * apps/web has had this since the 2026-08 session audit (§7 Phase 1) and desktop-web has its own;
 * admin-v2 was the one surface with no wake path at all, and it is also the one that logs you out
 * on its own. Those two facts met: after a laptop sleep or a dropped link the socket is a half-open
 * zombie, and nothing notices until the SDK keep-alive misses two pongs (~40-80s). Until then no
 * `auth.refresh` can be carried, and both of the console's auto-logout paths are counting —
 * `useRelaySessionGuard`'s streak and `RelayCredentialRenewer`'s 30s expiry-confirmation window,
 * which is explicitly waiting for a reconnect that this hook is what triggers.
 *
 * `recoverUnverifiedSockets` no-ops per slot when the socket is verified or not yet booted, so
 * mounting it before login is inert. Throttled because `visibilitychange` and `online` can land
 * together, and a kick is a real reconnect.
 */
import { useEffect, useRef } from 'react';

import { runtime } from '@chatic/app-runtime';

/** One kick per window — rapid focus/online toggling must not churn the socket. */
const KICK_THROTTLE_MS = 5_000;

export const useSocketWakeRecovery = (enabled: boolean): void => {
    const lastKickRef = useRef(0);

    useEffect(() => {
        if (!enabled) return;

        const kick = (): void => {
            // Only when the tab is actually in front: a hidden tab's blur/hide edges are not a wake.
            if (document.visibilityState !== 'visible') return;
            const now = Date.now();
            if (now - lastKickRef.current < KICK_THROTTLE_MS) return;
            lastKickRef.current = now;
            void runtime.connection.recoverUnverifiedSockets();
        };

        window.addEventListener('focus', kick);
        window.addEventListener('online', kick);
        document.addEventListener('visibilitychange', kick);
        return () => {
            window.removeEventListener('focus', kick);
            window.removeEventListener('online', kick);
            document.removeEventListener('visibilitychange', kick);
        };
    }, [enabled]);
};

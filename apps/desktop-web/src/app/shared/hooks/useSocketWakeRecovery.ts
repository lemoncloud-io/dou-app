import { useEffect, useRef } from 'react';

import { isNative } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';

// Rapid focus/visibility/online toggling shouldn't churn the socket — coalesce
// wake kicks into one attempt per window.
const RECOVER_THROTTLE_MS = 5_000;

/**
 * Kick socket recovery the instant the app returns to the foreground or the network
 * comes back, instead of waiting for the SDK keep-alive to notice a socket that died
 * during sleep. Electron only (a plain browser tab manages its own lifecycle and must
 * never be poked like this).
 *
 * The kick is the runtime's `recoverUnverifiedSockets`, the same pass admin-v2 uses: per
 * bound slot that is not verified — relay and every cloud, not only the active one — it
 * closes the socket, re-seeds a terminally expired controller, and connects again. The
 * connect is what matters. A bare `disconnect()` routes into the SDK reconnect controller's
 * `stop()`, which leaves the controller stopped, so the socket stayed closed until
 * `useSocketWedgeReload` reloaded the renderer 25 s later. Verified slots are skipped by the
 * pass itself, so a kick on a healthy app costs nothing. A genuinely expired token still
 * fails re-auth and falls through to that reload.
 */
export const useSocketWakeRecovery = (): void => {
    const lastKickRef = useRef(0);

    useEffect(() => {
        if (!isNative()) return;

        const kick = () => {
            // Ignore blur/hide edges — only recover when the app is actually in front.
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

            const now = Date.now();
            if (now - lastKickRef.current < RECOVER_THROTTLE_MS) return;
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
    }, []);
};

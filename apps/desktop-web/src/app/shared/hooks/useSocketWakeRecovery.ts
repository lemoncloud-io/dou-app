import { useEffect, useRef } from 'react';

import { isNative } from '@chatic/bridges';
import { getSocketManager } from '@chatic/app-runtime';

// Rapid focus/visibility/online toggling shouldn't churn the socket — coalesce
// wake kicks into one attempt per window.
const RECOVER_THROTTLE_MS = 5_000;

/**
 * Kick socket recovery the instant the app returns to the foreground or the network
 * comes back. After a short sleep the live WS silently dies, but no request carries it
 * back and the periodic heal only runs every ~60s — so live messages stall until then.
 * Reconnect + re-auth on wake instead, for instant recovery. Only fires while the socket
 * is actually unverified; a genuinely expired token still fails re-auth and falls through
 * to useSocketWedgeReload's reload. Electron only (a plain browser tab manages its own
 * lifecycle and must never be poked like this).
 */
export const useSocketWakeRecovery = (): void => {
    const lastKickRef = useRef(0);

    useEffect(() => {
        if (!isNative()) return;

        const kick = () => {
            // Ignore blur/hide edges — only recover when the app is actually in front.
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            const manager = getSocketManager();
            if (manager.getSnapshot().isVerified) return; // already healthy — nothing to do

            const now = Date.now();
            if (now - lastKickRef.current < RECOVER_THROTTLE_MS) return;
            lastKickRef.current = now;
            void manager.recover('wake');
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

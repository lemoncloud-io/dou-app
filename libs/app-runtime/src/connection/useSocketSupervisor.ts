import { useEffect } from 'react';

import { forceReconnect, probeSocket, restartSocket, useWebSocketV2Store } from '@chatic/socket';

/**
 * Time the socket may stay unhealthy before the watchdog forces recovery. The
 * cold-start handshake (connect → device.save → auth.update → verified) settles
 * in well under this, so it never fires mid-connect.
 */
const UNHEALTHY_GRACE_MS = 6_000;
/** Minimum gap between forced recoveries — stops a flapping link from thrashing. */
const RECOVER_COOLDOWN_MS = 12_000;
/** Foreground health-check cadence. */
const WATCHDOG_MS = 4_000;

interface SupervisorParams {
    /** Mirror the connection's `enabled` so we never fight an intentionally-down socket. */
    enabled: boolean;
}

/**
 * Keeps the socket alive across the cases the package's own reconnect cannot
 * recover on its own:
 *
 * 1. **Zombie socket** — after OS sleep or a network change the browser still
 *    reports the WebSocket as OPEN, so `state` stays `connected`, `forceReconnect`
 *    no-ops, and the keepalive takes ~50s to notice. On resume we probe; a dead
 *    probe forces a hard restart immediately.
 * 2. **Stuck disconnected** — surface the package's backoff with an immediate
 *    `forceReconnect` instead of waiting out the (up-to-30s) interval.
 * 3. **Wedged handshake** — `connected` but never `verified`; a hard restart
 *    re-runs device.save + auth.update.
 *
 * Recovery triggers on the moments a user re-engages (tab/window visible, focus,
 * network online) plus a foreground watchdog for anything that slips through.
 */
export const useSocketSupervisor = ({ enabled }: SupervisorParams): void => {
    useEffect(() => {
        if (!enabled) return;

        let lastRecoverAt = 0;
        let unhealthySince = 0;
        let disposed = false;

        const isHealthy = () => {
            const { connectionStatus, isVerified } = useWebSocketV2Store.getState();
            return connectionStatus === 'connected' && isVerified;
        };

        const cooldownOk = () => Date.now() - lastRecoverAt > RECOVER_COOLDOWN_MS;

        // Pick the cheapest recovery that fits the current state.
        const recover = async () => {
            if (disposed || !cooldownOk()) return;
            lastRecoverAt = Date.now();
            const { connectionStatus } = useWebSocketV2Store.getState();
            // Not connected → just kick the backoff. Connected (zombie or wedged
            // handshake) → hard restart, since forceReconnect can't replace a live one.
            if (connectionStatus !== 'connected') forceReconnect();
            else await restartSocket();
        };

        // Resume path: when the socket claims to be healthy, a zombie can only be
        // ruled out by an actual round-trip — so probe before trusting it.
        const onResume = async () => {
            if (disposed) return;
            const { connectionStatus, isVerified } = useWebSocketV2Store.getState();
            if (connectionStatus !== 'connected' || !isVerified) {
                await recover();
                return;
            }
            const alive = await probeSocket();
            if (!alive) await recover();
        };

        const onVisible = () => {
            if (document.visibilityState === 'visible') void onResume();
        };
        const onFocus = () => void onResume();
        const onOnline = () => void onResume();

        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onFocus);
        window.addEventListener('online', onOnline);

        const watchdog = window.setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            if (isHealthy()) {
                unhealthySince = 0;
                return;
            }
            if (!unhealthySince) {
                unhealthySince = Date.now();
                return;
            }
            if (Date.now() - unhealthySince > UNHEALTHY_GRACE_MS) void recover();
        }, WATCHDOG_MS);

        return () => {
            disposed = true;
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('online', onOnline);
            window.clearInterval(watchdog);
        };
    }, [enabled]);
};

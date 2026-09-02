import { logger } from '@chatic/bridges';
import {
    commitServerRefreshedToken,
    getServerAuthRegistration,
    logoutCloudSession,
    logoutRelaySession,
    signServerAuth,
} from '../../session';

import type { SocketSessionDelegate } from './types';

/**
 * Builds the socket session delegate that bridges the SDK AuthController (wired by
 * bootstrapSocketConnection) to web-core's PER-SERVER auth helpers. Every method is keyed by the
 * socket's kind, so the relay and cloud sockets each seed/sign/write-back against their own server.
 *
 * Module-level (not a hook) so non-React callers — applySessionToken — can build the same delegate;
 * the React side wraps it in useSocketSessionDelegate. Every member is a module-level web-core
 * function, so instances are interchangeable and carry no state.
 */
export const createSocketSessionDelegate = (): SocketSessionDelegate => ({
    getAuthRegistration: kind => getServerAuthRegistration(kind),
    signAuth: (kind, _token, target) => signServerAuth(kind, target),
    // Routed by the socket's own kind (§6-6). The SDK AuthTokenView is not exported from the
    // package root; web-core casts it to its own UserTokenView at this boundary.
    commitRefreshedToken: (kind, view) =>
        commitServerRefreshedToken(kind, view as Parameters<typeof commitServerRefreshedToken>[1]),
    onAuthExpired: kind => {
        if (kind === 'cloud') {
            // cloud expiry: tear down only the cloud session; relay stays the baseline.
            logoutCloudSession();
            return;
        }
        // Relay terminal `expired`: the SDK only reaches this after `maxFailures` consecutive
        // sign/refresh attempts fail (SocketManager AUTH_OPTIONS, currently 3) — a wedged
        // signature that no amount of waiting will fix on its own. Auto-logout here (POLICY,
        // superseding the old manual-only stance) so the runtime's guest-login fallback picks
        // up a clean session instead of leaving the UI in an authenticated-looking zombie state
        // (isVerified=false forever, relay token still sitting in the store).
        logger.warn('SOCKET', '[delegate] relay auth expired — auto-logging out');
        return logoutRelaySession();
    },
});

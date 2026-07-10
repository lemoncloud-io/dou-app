import { logger } from '@chatic/bridges';
import { type LogoutOptions, logoutRelaySession } from '@chatic/web-core';

import { getSocketManager } from './runtime';

/**
 * Ends the active relay session — owned by app-runtime now that ClientSocketAuth performs the
 * socket-side logout (multi-socket-design.md §6-11).
 *
 * Two steps:
 *  1. best-effort socket `auth.logout()` — FIRE-AND-FORGET. It dispatches the logout frame over the
 *     live socket synchronously (before step 2 clears the token) and stops the SDK auth controller,
 *     but we do NOT await its server ack: on a wedged/half-open socket that ack can hang to the 30s
 *     request timeout, and it must never block the authoritative revoke + redirect.
 *  2. web-core `logoutRelaySession()` — the AUTHORITATIVE backend revoke (HTTP `/users/logout`) plus
 *     store clear + redirect. This ALWAYS runs and is awaited, so a disconnected/wedged socket (where
 *     step 1 could not reach the server) is still revoked over HTTP with no delay.
 */
export const logoutSession = async (options?: LogoutOptions): Promise<void> => {
    const auth = getSocketManager().getClient()?.auth;
    if (auth) {
        // Dispatched now (frame goes out before the token is cleared), but not awaited — see step 1.
        // logout() is best-effort and does not reject, but the promise is guarded regardless.
        void Promise.resolve(auth.logout()).catch(error =>
            logger.warn('SOCKET', '[logoutSession] socket auth.logout failed (HTTP logout already proceeded)', {
                error,
            })
        );
    }

    await logoutRelaySession(options);
};

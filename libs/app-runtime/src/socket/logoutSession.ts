import { logger } from '@chatic/bridges';
import { type LogoutOptions, logoutRelaySession } from '@chatic/web-core';

import { getSocketManager } from './runtime';

/**
 * Ends the active relay session — owned by app-runtime now that ClientSocketAuth performs the
 * socket-side logout (multi-socket-design.md §6-11).
 *
 * Two steps, in order:
 *  1. best-effort socket `auth.logout()` — notifies the server over the live socket and stops the
 *     SDK auth controller. The SDK skips the server notify when the socket is disconnected and never
 *     throws, so this is safe to always attempt.
 *  2. web-core `logoutRelaySession()` — the AUTHORITATIVE backend revoke (HTTP `/users/logout`) plus
 *     store clear + redirect. This ALWAYS runs, so a disconnected socket (where step 1 could not
 *     reach the server) is still revoked over HTTP.
 *
 * Step 1 runs first so `auth.logout` goes out while the socket is still authenticated; step 2 then
 * clears the token, which drops `binding.socket` and tears the socket down.
 */
export const logoutSession = async (options?: LogoutOptions): Promise<void> => {
    const auth = getSocketManager().getClient()?.auth;
    if (auth) {
        try {
            await auth.logout();
        } catch (error) {
            // logout() is documented best-effort, but guard anyway so HTTP logout always proceeds.
            logger.warn('SOCKET', '[logoutSession] socket auth.logout failed (continuing to HTTP logout)', { error });
        }
    }

    await logoutRelaySession(options);
};

import { logger } from '@chatic/bridges';
import { type LogoutOptions, logoutRelaySession } from '@chatic/web-core';

import { getSocketManager } from '../runtime';
import type { SocketKind } from '../types';

/**
 * Best-effort socket `auth.logout()` for one slot — FIRE-AND-FORGET. It dispatches the logout frame
 * over the live socket synchronously (before the caller clears the token) and stops the SDK auth
 * controller, but the server ack is NOT awaited: on a wedged/half-open socket that ack can hang to
 * the 30s request timeout, and it must never block the local teardown + redirect.
 */
export const notifySocketLogout = (kind: SocketKind): void => {
    const auth = getSocketManager().getClient(kind)?.auth;
    if (!auth) return;
    // logout() is best-effort and does not reject, but the promise is guarded regardless.
    void Promise.resolve(auth.logout()).catch(error =>
        logger.warn('SOCKET', '[logoutSession] socket auth.logout failed (local teardown already proceeded)', {
            error,
            data: { kind },
        })
    );
};

/**
 * Ends the FULL relay session — owned by app-runtime now that ClientSocketAuth performs the
 * socket-side logout (multi-socket-design.md §8-6).
 *
 * A relay logout tears down everything:
 *  1. best-effort `auth.logout()` on the relay AND cloud slots (§8-6: relay logout ends both) — ends
 *     the socket auth session on each server.
 *  2. web-core `logoutRelaySession()` — a purely LOCAL teardown (clears relay/cloud tokens +
 *     credentials + selection) then redirect. There is no server-side revoke endpoint, so nothing is
 *     awaited over HTTP. Clearing the relay token drops both binding slots, so SocketBinder tears the
 *     clients down afterwards.
 */
export const logoutSession = async (options?: LogoutOptions): Promise<void> => {
    notifySocketLogout('relay');
    notifySocketLogout('cloud');

    await logoutRelaySession(options);
};

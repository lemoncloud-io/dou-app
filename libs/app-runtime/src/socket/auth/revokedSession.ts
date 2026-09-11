import { logger } from '@chatic/bridges';

import { relaySession } from '../../session/auth/relaySession';

/**
 * A REVOKED relay session — the one auth failure the runtime cannot renew its way out of.
 *
 * The backend stamps `AuthModel.revoked` on `POST /users/0/logout` (chatic-backend-api
 * `modules/auth/proxy.ts` `doLogout`) and then refuses every refresh and every issue for that
 * session with `403 NOT ALLOWED - session revoked @<scope>` (`service/backend-proxy.ts`). Nothing
 * the client holds can un-revoke it: refresh 403s, and `delegate-cloud` — the first step of a cloud
 * switch — is relay-signed, so it 403s too. The session is over; only a new one works.
 *
 * Without this verdict the runtime treats a revoked session as an authenticated one, because
 * `isAuthenticated` is a session-EXISTENCE probe (`hasStoredRelaySession`): the dead token is still
 * in the store, so `useRelaySessionKeepAlive` never re-logs in and every screen shows its own
 * generic failure ("Couldn't switch cloud. Try again.") while nothing recovers. The session ends
 * some 30s later anyway, through `RelayCredentialRenewer.onTerminalExpiry`, but with no attribution
 * — the user sees their session vanish after a string of unrelated errors
 * (`.claude/20260910/DEBUG-17-30-25.md`).
 *
 * **Only `auth.switch` can carry this verdict today.** `AuthSwitchError` keeps the server error as
 * its `cause`, so the message survives to us. The other two candidate surfaces cannot:
 *  - `auth.refresh()` rejects with a bare `Error('auth.refresh failed: server')` — the SDK's
 *    `doRefresh` drops the server error (chatic-sockets-api `client-socket-v2/auth-controller.ts`),
 *    which is why `requestRelaySessionRefresh` has nothing to branch on.
 *  - signed HTTP (`clouds/0/list`, `delegate-cloud`) never sees a status at all: the API Gateway 403
 *    carrying it has no CORS header, so the browser reports a network failure — the case
 *    `HttpManager`'s `CredentialStalenessPort` doc already names.
 */
const REVOKED_MARKER = 'session revoked';

/** Cause chains are shallow here (SDK error → server error); the cap only stops a cyclic `cause`. */
const MAX_CAUSE_DEPTH = 5;

const messageOf = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return typeof error === 'string' ? error : '';
};

/**
 * True when `error` (or anything in its `cause` chain) is the backend's revoked-session rejection.
 *
 * Matched on the message because that is the only place it exists — the socket transports the
 * server error as text, so there is no status or code to read.
 */
export const isRevokedSessionError = (error: unknown): boolean => {
    let current: unknown = error;
    for (let depth = 0; depth < MAX_CAUSE_DEPTH && current; depth += 1) {
        if (messageOf(current).includes(REVOKED_MARKER)) return true;
        current = (current as { cause?: unknown })?.cause;
    }
    return false;
};

/**
 * One teardown per page life. A revoked session fails EVERY request, so the verdict can land several
 * times before the redirect below actually navigates.
 */
let handled = false;

/** Test seam — a case must not inherit the previous one's teardown. */
export const resetRevokedSessionHandling = (): void => {
    handled = false;
};

/**
 * Ends a session the server has already revoked, so the runtime can log in again.
 *
 * `clearAndRedirect` and NOT `logoutSession`: the socket `auth.logout` that `logoutSession` fires
 * first would only 403 (the same guard rejects it), and there is nothing left to revoke. What is
 * needed is the LOCAL teardown — drop the dead token, land on `/` — after which
 * `useRelaySessionKeepAlive` sees an absent session and runs its guest login. A user who was signed
 * in beyond guest has to sign in again; that is what a revoked session means, and it is the same
 * end state `onTerminalExpiry` reaches, minus the silent 30s of 403s.
 *
 * The persisted token bundle is NOT removed here — `clearAndRedirect` lands on `/?logout=1` and the
 * next document's `logoutStorageSweeper` wipes it. That split is load-bearing: while the sweep was
 * unwired (7139e42c → restored in 1a83ee65) a logout revoked the session server-side and then booted
 * right back into the same dead token, which is the zombie this module exists to end.
 */
export const handleRevokedRelaySession = async (scope: string): Promise<void> => {
    if (handled) return;
    handled = true;

    logger.error('AUTH', '[revokedSession] relay session revoked by the server — clearing it', {
        data: { scope },
    });

    await relaySession.clearAndRedirect();
};

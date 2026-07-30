import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/bridges';
import { loginRelayByToken } from '@chatic/web-core';

import { getSocketManager } from '../runtime';
import { reauthenticateActiveSocket } from './reauthenticateActiveSocket';
import { createSocketSessionDelegate } from './sessionDelegate';

/** Upper bound for the relay slot to re-verify the new identity before we give up waiting. */
const DEFAULT_APPLY_TIMEOUT_MS = 10_000;

export interface ApplySessionTokenOptions {
    /** Override for tests / impatient callers; the promise REJECTS when the wait exceeds it. */
    timeoutMs?: number;
}

/** The fields the socket re-registration path requires from a `$token` (see the guard below). */
type SessionTokenView = UserTokenView & { $auth?: { id?: string } };

/**
 * Applies the `$token` of a successful `auth.verify-hash-alias step=check` as the ACTIVE session:
 * commits it to web-core (credentials + relay token store) and re-authenticates the live relay
 * socket to the new identity ON THE SAME CONNECTION. Once resolved, the socket identity is the
 * main user — `invite.create`/`invite.accept`, which 403 for a device user, succeed on the same
 * connection (relay-server-invite/05-client-guide.md §A-1; roadmap Track A contract).
 *
 * Path notes (the spike this function pins down):
 * - The SDK's `auth.refresh`/`auth.switch` re-sign the SAME identity (authId + signature), so they
 *   cannot carry a different user's token. The SDK route for an identity swap is
 *   `logout() → register(newToken)` — register on an inactive controller resumes and re-sends
 *   `auth.update` immediately when connected. That is exactly reauthenticateActiveSocket (the
 *   guest→social promotion path), which we call directly so completion is awaitable.
 * - The store leads, the socket follows: web-core is committed first, so the React-side
 *   SocketReauthBinder observing the same token change converges to a no-op (token equality guard).
 * - Only the RELAY slot is touched: verify-hash-alias is a relay/backend identity and the invite +
 *   identity gateways are pinned to the relay slot (remoteFactory). An active cloud session keeps
 *   its own still-valid delegated identity.
 *
 * An EMPTY `$token` means the number was merely linked and the session did not change (client
 * guide §A-1) — resolves as a no-op. A `$token` that carries an identityToken but lacks the fields
 * the socket re-registration needs (`$auth.id`) rejects BEFORE anything is committed, so a contract
 * regression can never leave the HTTP and socket identities split.
 */
export const applySessionToken = async ($token: unknown, options?: ApplySessionTokenOptions): Promise<void> => {
    const view = ($token ?? null) as SessionTokenView | null;
    const identityToken = view?.Token?.identityToken;
    if (!identityToken) {
        // Linked-only check result — the session is unchanged, nothing to apply.
        return;
    }
    if (!view?.$auth?.id) {
        // Without $auth.id the relay socket cannot re-register (getServerAuthRegistration seeds
        // authId from it), so committing the token would leave the socket on the old identity.
        throw new Error('[applySessionToken] $token.$auth.id missing — cannot re-register the relay socket');
    }

    await loginRelayByToken(view);

    const manager = getSocketManager();
    await reauthenticateActiveSocket({ manager, delegate: createSocketSessionDelegate(), kind: 'relay' });

    const auth = manager.getClient('relay')?.auth;
    if (!auth) {
        // No relay slot yet (socket not booted). The committed token is the store SSoT, so the next
        // bootstrap registers the new identity — nothing to wait for on a live connection.
        logger.info('SOCKET', '[applySessionToken] no relay slot bound — token committed, socket applies on boot');
        return;
    }

    await waitUntilAuthenticated(auth, options?.timeoutMs ?? DEFAULT_APPLY_TIMEOUT_MS);

    // Post-condition. reauthenticateActiveSocket returns silently when the store has no registration
    // to read back, and `ready()` resolves instantly on a socket that is still authenticated as the
    // PREVIOUS identity — so without this check the two together would report success while the
    // connection is still the device user, and the caller's next invite.create would 403. Rejecting
    // here keeps the failure in the one place the UI can retry the switch alone (the OTP is spent).
    if (auth.token !== identityToken) {
        throw new Error('[applySessionToken] relay socket did not adopt the new identity');
    }
};

/**
 * Resolves once the controller reports `authenticated` (ready()), rejects on terminal auth failure
 * or after `timeoutMs`. ready() itself never times out — a disconnected socket would park the
 * handshake until reconnect — so the deadline keeps the caller's UI from hanging; the committed
 * token still applies on the next successful handshake.
 */
const waitUntilAuthenticated = async (auth: { ready(): Promise<void> }, timeoutMs: number): Promise<void> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`[applySessionToken] relay re-auth not confirmed within ${timeoutMs}ms`)),
            timeoutMs
        );
    });
    try {
        await Promise.race([auth.ready(), deadline]);
    } finally {
        clearTimeout(timer);
    }
};

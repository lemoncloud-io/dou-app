import { logger } from '@chatic/bridges';

import { getSocketManager } from '../runtime';
import type { ISocketManager } from '../types';

/**
 * How long a finished attempt answers for the next caller.
 *
 * Both readings hold inside this window. A SUCCESS means the credential was just re-minted and is
 * good for the best part of an hour, so "yes, they are fresh" needs no second round trip. A FAILURE
 * means the socket could not reach the refresh owner, and nothing about that changes in three
 * seconds — asking again only burns another attempt.
 *
 * Short on purpose: this is a burst absorber, not a cache. Anything longer starts answering for a
 * session state it can no longer vouch for (a socket that came up right after a failure, a writeback
 * that carried no credential), and the honest recovery for those is to actually ask again.
 */
const RESULT_MEMO_MS = 3_000;

export interface RequestRelaySessionRefreshDeps {
    manager?: ISocketManager;
}

/**
 * Coalesces refresh attempts: concurrent askers share one, and a just-settled answer serves the next
 * caller for `RESULT_MEMO_MS`.
 *
 * **Half of this used to be load-bearing and is now the SDK's.** `auth.refresh()` joins an in-flight
 * refresh instead of starting a second one (sockets-lib 0.5.1), so the epoch pile-up this class was
 * built to prevent — N concurrent attempts, each bump invalidating the previous response, the first
 * N-1 timing out and counting toward `maxFailures` until the controller went terminal `expired` —
 * cannot happen through the controller any more.
 *
 * What stays ours is what never reaches the controller. A "no authenticated socket" verdict is
 * decided here and returns before `auth.refresh()` is called, so the SDK's join cannot coalesce it:
 * without the in-flight slot, N simultaneous askers on a dead socket each log their own warning. And
 * the settled-result memo answers a question the SDK does not — "we asked three seconds ago" — which
 * is what keeps a burst of failures from spending an attempt each.
 *
 * One slot, not a per-kind map: this trigger is relay-only (see `requestRelaySessionRefresh`).
 */
class RelayRefreshCoalescer {
    private inFlight: Promise<boolean> | null = null;
    private lastResult: { at: number; ok: boolean } | null = null;

    /** Runs `attempt`, or hands back the shared/remembered answer. */
    request(attempt: () => Promise<boolean>): Promise<boolean> {
        if (this.inFlight) {
            return this.inFlight;
        }

        if (this.lastResult && Date.now() - this.lastResult.at < RESULT_MEMO_MS) {
            return Promise.resolve(this.lastResult.ok);
        }

        // Started synchronously (nothing awaits before the field write) so the attempt is registered
        // before any caller in the same tick can look for it — two failures resolving in one
        // microtask queue must find each other.
        const running = attempt()
            .then(ok => {
                this.lastResult = { at: Date.now(), ok };
                return ok;
            })
            .finally(() => {
                this.inFlight = null;
            });

        this.inFlight = running;
        return running;
    }

    /** Test seam: a case must not inherit the previous one's shared attempt or memoized answer. */
    reset(): void {
        this.inFlight = null;
        this.lastResult = null;
    }
}

const coalescer = new RelayRefreshCoalescer();

/** Drops the coalescing state. Tests only — see `RelayRefreshCoalescer.reset`. */
export const resetRelayRefreshCoalescing = (): void => coalescer.reset();

/**
 * One actual refresh attempt through the relay socket's controller. Never called directly — every
 * caller goes through `requestRelaySessionRefresh`, which owns the coalescing.
 */
class RelayRefreshAttempt {
    constructor(private readonly deps: RequestRelaySessionRefreshDeps) {}

    async run(): Promise<boolean> {
        const manager = this.deps.manager ?? getSocketManager();
        const client = manager.getClient('relay');
        const auth = client?.auth;

        if (!client || !auth || client.state !== 'connected' || auth.state !== 'authenticated') {
            logger.warn('SOCKET', '[requestRelaySessionRefresh] no authenticated relay socket to refresh through', {
                data: { clientState: client?.state ?? null, authState: auth?.state ?? null },
            });
            return false;
        }

        // The handshake must have completed on THIS connection, and `auth.state` alone cannot say so.
        // A transport drop leaves the SDK controller's state untouched (`stop()` clears `active` and
        // the timers, never `_state`), so right after a reconnect it still reads `authenticated` from
        // the connection that just died — while the new connection has not run `device.save` yet.
        // Refreshing into that window reaches the server on a connection row with no device linked,
        // and the server rejects it (`400 BAD REQUEST - no device linked @auth.refresh(...)`), burning
        // an attempt for a race rather than for a session problem.
        //
        // `isKindVerified` is the flag that does track the current connection: SocketManager clears it
        // on every non-`connected` transition and only the controller's own `authenticated` emission
        // sets it again — which the bootstrap gate holds until `device.save:ok` (bootstrapSocketConnection
        // §ordering). So true here means device registration already landed on this very connection.
        if (!manager.isKindVerified('relay')) {
            logger.warn('SOCKET', '[requestRelaySessionRefresh] relay handshake not complete on this connection', {
                data: { clientState: client.state, authState: auth.state },
            });
            return false;
        }

        try {
            // Resolves after the controller's own `onTokenRefresh` has fired, which is the emission
            // `bootstrapSocketConnection` routes into `commitRefreshedToken`. So a resolve here
            // means the writeback was invoked, not merely that the server answered.
            await auth.refresh();
            return true;
        } catch (error) {
            // A rejection is THIS attempt's answer, not a session verdict: the controller's own
            // backoff keeps retrying behind us, and it decides on its own when to go terminal. The
            // error carries its reason in the message only (`not-registered`, `not-connected`,
            // `sign`, `superseded`, or a transport `408`), so there is nothing to branch on — the
            // caller asked a yes/no question.
            logger.warn('SOCKET', '[requestRelaySessionRefresh] relay socket refresh failed', { error });
            return false;
        }
    }
}

/**
 * THE single entry point for "this session's HTTP credentials look stale — make them fresh"
 * (2026-08 session audit §7 Phase 2-3). Callers (e.g. admin-v2's session guard, the transport's
 * recover-and-retry) must not fire their own refresh — that is how the second refresh engine and its
 * store divergence happened.
 *
 * There is exactly ONE route: `auth.refresh()` on a connected, authenticated relay `AuthController`
 * (public since sockets-lib 0.5.1). It resolves after the controller's `onTokenRefresh` fires — the
 * same emission `bootstrapSocketConnection` routes into `commitServerRefreshedToken`, which re-mints
 * the HTTP/AWS credentials — so resolution means the refresh SUCCEEDED and the writeback was invoked.
 *
 * **Relay only, by name.** This used to take a `SocketKind`, and `'cloud'` was a door nobody walked
 * through and nobody should: a cloud token is minted FROM the relay identity, so its recovery is a
 * re-issue (`renewCloudSession` → `delegate-cloud` + `exchange-token`), which also works with the
 * cloud socket down. Refresh is what a token with no parent does. Offering both on one signature
 * invited sending the recovery to the server that cannot give it — the asymmetry ADR-0070 fixed in
 * policy but left open in this API. (The cloud socket still refreshes its own token; that is the
 * SDK's periodic loop, not an app trigger.)
 *
 * **No HTTP fallback.** This used to fall back to the service-level refresh when no live socket was
 * available. That fallback was a second way to reach the refresh endpoint, which is precisely what
 * ADR-0070 불변조건 1·2 forbids — refresh is `ClientSocketAuth`'s alone. Without a socket the honest
 * answer is "not refreshed": the caller should get the socket back (`useSocketWakeRecovery`) rather
 * than route around it, because a refresh that bypasses the socket updates the stores while leaving
 * the socket's own signing material untouched — the divergence this ADR exists to remove.
 *
 * Returns true when the refresh succeeded, false otherwise (including "no socket to ask" and "the
 * socket is back but its handshake has not completed yet"). Never throws.
 */
export const requestRelaySessionRefresh = (deps: RequestRelaySessionRefreshDeps = {}): Promise<boolean> =>
    coalescer.request(() => new RelayRefreshAttempt(deps).run());

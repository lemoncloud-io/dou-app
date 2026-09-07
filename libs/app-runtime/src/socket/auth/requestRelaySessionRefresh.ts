import { logger } from '@chatic/bridges';

import { Coalescer } from '../../utils/coalescer';
import { canRefreshThroughSocket, getAuthSnapshot } from './authStatus';
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
 * session state it can no longer vouch for, and the honest recovery for those is to actually ask again.
 */
const RESULT_MEMO_MS = 3_000;

/**
 * One slot, not a per-kind map: this trigger is relay-only (see `requestRelaySessionRefresh`).
 *
 * The bespoke `RelayRefreshCoalescer` this replaces was the only one of the runtime's seven
 * hand-rolled concurrency guards that had grown into a real class; `Coalescer` is that class with
 * the domain prefix removed (ADR-0074 결정 4). Half of what it once did is the SDK's now:
 * `auth.refresh()` joins an in-flight refresh instead of starting a second one (sockets-lib 0.5.1),
 * so the epoch pile-up it was built to prevent cannot happen through the controller any more. What
 * stays ours is what never reaches the controller — a "no authenticated socket" verdict.
 */
const coalescer = new Coalescer<boolean>({ memoMs: RESULT_MEMO_MS });

export interface RequestRelaySessionRefreshDeps {
    manager?: ISocketManager;
}

/** Drops the coalescing state. Tests only — a case must not inherit the previous one's answer. */
export const resetRelayRefreshCoalescing = (): void => coalescer.reset();

/**
 * One actual refresh attempt through the relay socket's controller. Never called directly — every
 * caller goes through `requestRelaySessionRefresh`, which owns the coalescing.
 */
class RelayRefreshAttempt {
    constructor(private readonly deps: RequestRelaySessionRefreshDeps) {}

    async run(): Promise<boolean> {
        const manager = this.deps.manager ?? getSocketManager();

        // ONE judgement, from the single truth table (ADR-0074 결정 1). This used to be two separate
        // condition blocks here — "is there an authenticated socket" and "did the handshake complete
        // on THIS connection" — and the second existed because `auth.state` cannot answer it: a
        // transport drop leaves the SDK controller's state untouched (`stop()` clears `active` and the
        // timers, never `_state`), so right after a reconnect it still reads `authenticated` from the
        // connection that just died while the new one has not run `device.save` yet. Refreshing into
        // that window reaches the server on a connection row with no device linked and is rejected
        // (`400 BAD REQUEST - no device linked @auth.refresh(...)`), burning an attempt for a race.
        // `deriveAuthStatus` folds that reasoning in: only `verified`/`stale` imply
        // verified-on-this-connection.
        const snapshot = getAuthSnapshot('relay', { manager });
        if (!canRefreshThroughSocket(snapshot.status)) {
            logger.warn('SOCKET', '[requestRelaySessionRefresh] relay cannot carry a refresh right now', {
                data: {
                    status: snapshot.status,
                    transport: snapshot.transport,
                    controller: snapshot.controller,
                },
            });
            return false;
        }

        const auth = manager.getClient('relay')?.auth;
        if (!auth) return false;

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
    coalescer.run(() => new RelayRefreshAttempt(deps).run());

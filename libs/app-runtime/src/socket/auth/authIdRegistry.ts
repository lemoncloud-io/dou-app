import { logger } from '@chatic/bridges';

import type { SocketKind } from '../types';

/** The sign callback shape `auth.register()` takes (the SDK's `AuthSignCallback`). */
type SignCallback = (token: string, ctx?: { target?: string }) => Promise<{ signature: string; current: string }>;

/** The one AuthController member this registry drives — structural, so tests pass a stub. */
export interface AuthIdReseedTarget {
    register(opts: { token: string; authId: string; sign: SignCallback }): void;
}

/**
 * Mirror of the `authId` each slot's SDK AuthController was last registered with, and the re-seed
 * that corrects it when the two drift apart.
 *
 * **Why a mirror is needed at all.** An `auth.refresh` packet carries two things the server checks
 * against each other, and they come from DIFFERENT places:
 *
 *  - the packet's `authId` is `AuthControllerImpl`'s own private field, assigned in exactly three
 *    spots — construction (`''`), `register()`, and `logout()` (`''`). A refresh or switch response
 *    never touches it, and the controller exposes neither a getter nor a setter for it.
 *  - the packet's `signature` is recomputed by our sign callback from the STORE on every packet, and
 *    for relay the HMAC's outer key is `$auth.id` (signing.md §1).
 *
 * `commitRefreshedToken` replaces `$auth` wholesale on every writeback, so the moment a refresh or a
 * site switch hands back a different `$auth.id`, the store moves and the controller does not. The
 * server then FINDS the auth model by the stale id (so it is not `no auth model`) and verifies the
 * signature keyed on it — against a signature keyed on the fresh one:
 * `403 NOT ALLOWED - invalid sign @refreshAccessToken(<stale authId>)`. Nothing re-seeds the
 * controller afterwards, so that session 403s every refresh until the user logs in again.
 *
 * `reauthenticateActiveSocket`'s existing guard cannot catch this: it compares the identityToken, and
 * on the SDK's own writeback path the controller has already adopted the new token before the app
 * hears about it — the guard always reads "same token, nothing to do".
 *
 * One entry per kind: relay and cloud register independently and must never resync off each other
 * (multi-socket-design.md §6-6).
 */
class AuthIdRegistry {
    private readonly ids = new Map<SocketKind, string>();

    /** Call right after every `auth.register()` — the mirror is only as good as its writers. */
    record(kind: SocketKind, authId: string): void {
        this.ids.set(kind, authId);
    }

    /** What the controller is signing packets with, or null when this slot never registered here. */
    get(kind: SocketKind): string | null {
        return this.ids.get(kind) ?? null;
    }

    /**
     * Re-seeds the controller when `registration.authId` is no longer what we handed it. Returns true
     * when a re-seed actually ran, so the caller can re-close its activation gate.
     *
     * A bare `register()` is deliberately the whole correction: on an ACTIVE controller it only swaps
     * `_token`/`authId`/`sign` and sends nothing (the wire path sits behind the `!active` branch), so
     * this costs no round trip and does not disturb a healthy connection. The heavy
     * `logout() → register()` of `reauthenticateActiveSocket` would be wrong here — the identity did
     * not change, only the id the packets quote, and revoking the live backend session to fix a field
     * would log the user out over a bookkeeping mismatch.
     *
     * An unrecorded slot is NOT treated as drift: we cannot prove a divergence we never observed, and
     * guessing would fire a needless register on every boot.
     */
    resync(
        kind: SocketKind,
        auth: AuthIdReseedTarget,
        registration: { token: string; authId: string },
        sign: SignCallback
    ): boolean {
        const recorded = this.ids.get(kind);
        if (recorded === undefined || recorded === registration.authId) {
            return false;
        }

        // Loud: this is the only place the drift is visible, and its frequency is the evidence for
        // whether the backend rotates `$auth.id` at all (the open question behind this guard).
        logger.warn('SOCKET', '[authIdRegistry] registered authId drifted from the store — re-seeding', {
            data: { kind, registered: recorded, current: registration.authId },
        });

        auth.register({ token: registration.token, authId: registration.authId, sign });
        this.record(kind, registration.authId);
        return true;
    }

    /** Drops the mirror. Tests only — a case must not inherit the previous one's registration. */
    reset(): void {
        this.ids.clear();
    }
}

/**
 * Stateless from the callers' side — one mirror per process, keyed by kind, exactly like the socket
 * slots it tracks.
 */
export const authIdRegistry = new AuthIdRegistry();

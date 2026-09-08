import type { AuthControllerState, ClientSocketState } from '@lemoncloud/chatic-sockets-lib';

import { credentialFreshness } from '../../session/auth/credentialFreshness';
import type { ICredentialFreshness } from '../../session/auth/credentialFreshness';
import { cloudStore, relayStore } from '../../session/store/stores';
import { SDK_REFRESH_CYCLE_MS } from '../constants';
import { getSocketManager } from '../runtime';
import type { ISocketManager, SocketKind } from '../types';

/**
 * What the runtime should DO about one socket kind's authentication, as a single named value
 * (ADR-0076 결정 1).
 *
 * Before this, answering "is relay's auth healthy?" meant reading seven values from seven modules
 * and combining them — and that combination was written out three separate times
 * (`useSessionStalenessGuard` · `requestRelaySessionRefresh` · `recoverUnverifiedSockets`), each with
 * its own 20~40 line justification that did not reference the others. (`useConnectivity` looked like
 * a fourth but is not: it answers what to TELL THE USER, and the credential clock has no place in
 * that answer — ADR-0076 §결정 1.)
 * Nothing downstream — logs, the debug overlay — could reuse any of them, so reproducing an incident
 * meant lining the seven up by hand.
 *
 * `deriveConnectivity` was already the right shape for this: a pure truth table over a struct of
 * inputs, testable without a socket manager. This is that shape applied to authentication.
 *
 * **`wedged` is deliberately NOT one of these.** An earlier draft had it for "bound but unverified
 * for too long", which reads well but cannot be derived: "too long" needs a duration, and this
 * projection is read-only by contract (holding an `unverifiedSince` clock would make it a fifth copy
 * of session state — the failure ADR-0070 spent itself removing). The instantaneous fact is
 * `handshaking`, and the current code does not distinguish the two either: `recoverUnverifiedSockets`
 * kicks ANY bound-and-unverified slot. A caller that genuinely needs "still unverified after N
 * seconds" owns that timer itself.
 */
export type AuthStatus =
    /** No token for this server — logged out, or before the first login. Nothing to do. */
    | 'absent'
    /** Token present, this connection's handshake (`device.save` → `auth.update`) has not landed. */
    | 'handshaking'
    /** Verified on THIS connection and the credential has comfortable life left. */
    | 'verified'
    /** Verified, but the credential is at/below the margin (or unmeasurable) — needs renewing. */
    | 'stale'
    /** Auth SDK gave up (`maxFailures` burned). Terminal until something re-registers. */
    | 'expired';

/**
 * Exactly what {@link deriveAuthStatus} reads — nothing more, so the truth table has no hidden
 * inputs. Mirrors `ConnectivitySignals` next door.
 */
export interface AuthSignals {
    /** This server has a token in the store. */
    readonly hasToken: boolean;
    /**
     * `SocketManager.isKindVerified(kind)` — authenticated AND connected, scoped to the CURRENT
     * connection. This is the one flag that tracks the live connection: the SDK controller's own
     * state survives a transport drop, so right after a reconnect it still reads `authenticated`
     * from the connection that just died.
     */
    readonly verifiedOnThisConnection: boolean;
    /** The SDK `AuthController` state, or null when no slot/controller is bound. */
    readonly controller: AuthControllerState | null;
    /** Milliseconds left on this server's AWS credential; null when there is nothing to measure. */
    readonly credentialMs: number | null;
    /** Below this much remaining life the credential counts as `stale`. */
    readonly marginMs: number;
    /**
     * lemon-web-core's own stored-session clock (`isStoredSessionExpired`), which is a SEPARATE
     * clock from the credential's `Expiration` and diverges exactly where it matters — a socket
     * refresh that updated the token but carried no credential leaves this fresh while the signing
     * material is dead. `null` means "not measured" (cloud, or a caller that does not probe it).
     */
    readonly storedSessionExpired: boolean | null;
}

/** {@link AuthSignals} plus the slot it describes and the verdict, for logs and diagnostics. */
export interface SocketAuthSnapshot extends AuthSignals {
    readonly kind: SocketKind;
    readonly status: AuthStatus;
    /** Raw transport state. Not an input to the derivation (`verifiedOnThisConnection` subsumes it). */
    readonly transport: ClientSocketState | null;
}

/**
 * The single place `AuthStatus` is computed. Pure — no store, no socket, no clock.
 *
 * Order is the contract, not an implementation detail:
 *
 *  1. **No token wins.** Without one there is nothing to authenticate, whatever the socket says.
 *  2. **Terminal `expired` outranks the handshake.** The controller reaching `expired` means it
 *     burned `maxFailures` and stopped on its own; waiting for a handshake that will not be
 *     attempted is the zombie state ADR-0076 §맥락 1 describes.
 *  3. **Unverified-on-this-connection is `handshaking`.** See the `wedged` note on {@link AuthStatus}.
 *  4. **The stored-session clock counts as stale on its own.** It is the relay guard's primary
 *     trigger today and it can fire while the credential still looks fine.
 *  5. **Unmeasurable credential is stale, not fresh.** Guessing "fresh" when there is nothing to
 *     read is the direction that 403s; the pre-existing guard made the same choice.
 *
 * `stale` says the credential needs attention — it does NOT say to renew right now. Cadence,
 * cooldowns and opt-ins stay with the caller (`useCredentialGuard`), which is why this function
 * takes no time and returns no action.
 */
export const deriveAuthStatus = (signals: AuthSignals): AuthStatus => {
    if (!signals.hasToken) return 'absent';
    if (signals.controller === 'expired') return 'expired';
    if (!signals.verifiedOnThisConnection) return 'handshaking';
    if (signals.storedSessionExpired === true) return 'stale';
    if (signals.credentialMs == null || signals.credentialMs <= signals.marginMs) return 'stale';
    return 'verified';
};

/**
 * True when the socket can carry an `auth.refresh` right now — the pre-condition
 * `requestRelaySessionRefresh` checks before spending an attempt.
 *
 * Both `verified` and `stale` qualify: the handshake completed on this very connection, which is
 * what the server needs (refreshing into a connection with no device row linked answers
 * `400 BAD REQUEST - no device linked`).
 */
export const canRefreshThroughSocket = (status: AuthStatus): boolean => status === 'verified' || status === 'stale';

/**
 * True when a bound slot should be kicked (force-close → reconnect) on a foreground/wake signal.
 *
 * `handshaking` and `expired` only. A slot that looks healthy is left alone on purpose — kicking it
 * every time the app comes back would churn warm reconnects.
 */
export const needsSocketKick = (status: AuthStatus): boolean => status === 'handshaking' || status === 'expired';

// ---------------------------------------------------------------------------
// Signal collection. Same file as the pure derivation, mirroring
// `connection/hooks/useConnectivity.ts` (pure `deriveConnectivity` + its impure hook).
//
// No class and no lazily-built singleton: the sources are passed as an optional
// `*Deps` and resolved lazily when omitted — the shape the two neighbours in this
// folder already use (`requestRelaySessionRefresh(deps)` ·
// `recoverUnverifiedSockets(deps)`). Tests inject `deps` instead of resetting a
// module-level instance, so there is no `reset*` seam to remember.
// ---------------------------------------------------------------------------

/** Default staleness margin — one SDK refresh cycle. */
const DEFAULT_MARGIN_MS = SDK_REFRESH_CYCLE_MS;

export interface AuthSignalDeps {
    manager?: Pick<ISocketManager, 'getClient' | 'isKindVerified'>;
    freshness?: Pick<ICredentialFreshness, 'timeToExpiry'>;
    /** Overrides {@link DEFAULT_MARGIN_MS}; a caller with its own policy passes its own. */
    marginMs?: number;
    /**
     * lemon's stored-session clock, ALREADY AWAITED by the caller. Omitted means "not measured"
     * (`null`), which never reads as expired. It is not probed here because
     * `isStoredSessionExpired()` is async and relay-only — making this whole read async for one
     * caller's input would push `await` into a render path.
     */
    storedSessionExpired?: boolean | null;
}

/** Collects {@link AuthSignals} for one slot from the stores, the manager and the SDK controller. */
const readAuthSignals = (kind: SocketKind, deps: AuthSignalDeps = {}): AuthSignals => {
    const manager = deps.manager ?? getSocketManager();
    const freshness = deps.freshness ?? credentialFreshness;
    const identityToken = kind === 'cloud' ? cloudStore.getIdentityToken() : relayStore.getIdentityToken();

    return {
        hasToken: !!identityToken,
        verifiedOnThisConnection: manager.isKindVerified(kind),
        controller: manager.getClient(kind)?.auth?.state ?? null,
        credentialMs: freshness.timeToExpiry(kind),
        marginMs: deps.marginMs ?? DEFAULT_MARGIN_MS,
        storedSessionExpired: deps.storedSessionExpired ?? null,
    };
};

/** The one call sites use: collect, then derive. */
export const getAuthStatus = (kind: SocketKind, deps: AuthSignalDeps = {}): AuthStatus =>
    deriveAuthStatus(readAuthSignals(kind, deps));

/** {@link getAuthStatus} plus the inputs it used — for logs and the debug overlay. */
export const getAuthSnapshot = (kind: SocketKind, deps: AuthSignalDeps = {}): SocketAuthSnapshot => {
    const manager = deps.manager ?? getSocketManager();
    const signals = readAuthSignals(kind, deps);
    return {
        ...signals,
        kind,
        status: deriveAuthStatus(signals),
        transport: manager.getClient(kind)?.state ?? null,
    };
};

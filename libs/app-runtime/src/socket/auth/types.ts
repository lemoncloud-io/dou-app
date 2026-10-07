import type { SlotKey } from '../types';
import type { AuthRegistration } from '../../session/auth/sessionAuthAdapter';

/**
 * Bridges the SDK AuthController to the session. Owned by app-runtime
 * (connection/hooks/useSocketSessionDelegate), which wires it to the session's per-server helpers.
 * EVERY method is keyed by the socket's slot — the cloud it serves — so slots that bootstrap
 * independently each seed/sign/write-back/expire against their OWN server, never the global active
 * one (multi-socket-design.md §6-6, §7). It used to be keyed by kind (`relay | cloud`), which could
 * name only one cloud: the committed one. The key is a `SlotKey`, so a `'relay'`/`'cloud'` literal
 * cannot slip through as an address.
 *
 * - `getAuthRegistration(slot)` seeds `register({ token, authId })` for that server.
 * - `signAuth(slot, token, target?)` backs the SDK stateless sign callback (`target` is the switch selector).
 * - `commitRefreshedToken(slot, view)` writes an SDK-refreshed token back where that server's material
 *   lives — so a refresh arriving during a switch/teardown lands in the correct place. The view is the
 *   SDK `AuthTokenView`, typed here as `unknown` because that type is not exported from the SDK
 *   package root — the session boundary casts it to its own `UserTokenView`.
 * - `onAuthExpired(slot)` runs teardown when a socket reaches the terminal `expired` state (relay and a
 *   cloud escalate differently — §6-10).
 */
export interface SocketSessionDelegate {
    getAuthRegistration(slot: SlotKey): Promise<AuthRegistration | null>;
    signAuth(slot: SlotKey, token: string, target?: string): Promise<{ signature: string; current: string }>;
    commitRefreshedToken(slot: SlotKey, view: unknown): Promise<void> | void;
    onAuthExpired?(slot: SlotKey): Promise<void> | void;
    /** Each time the slot's session is (re-)established — after a connect, a refresh or a switch. */
    onAuthenticated?(slot: SlotKey): Promise<void> | void;
}

/**
 * The re-authentication subset: seed a registration, sign it. `reauthenticateActiveSocket` uses
 * exactly these two — the refresh writeback and the terminal-expiry escalation are no business of
 * that path — and narrowing the parameter is what lets its callers build a delegate without
 * reaching the renewers (see `reauthDelegate.ts`). Same `Pick` shape as
 * `ActiveScope.BoundCidSource`: the narrow type is made where it is needed, not declared up front.
 */
export type ReauthDelegate = Pick<SocketSessionDelegate, 'getAuthRegistration' | 'signAuth'>;

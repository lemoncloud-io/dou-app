import type { SocketKind } from '../types';

/**
 * Bridges the SDK AuthController to web-core. Owned by app-runtime
 * (connection/useSocketSessionDelegate), which wires it to web-core's per-server helpers. EVERY
 * method is keyed by the socket's `kind` so relay and cloud sockets, which bootstrap independently,
 * each seed/sign/write-back/expire against their OWN server — never the global active one
 * (multi-socket-design.md §6-6, §7).
 *
 * - `getAuthRegistration(kind)` seeds `register({ token, authId })` for that server.
 * - `signAuth(kind, token, target?)` backs the SDK stateless sign callback (`target` is the switch selector).
 * - `commitRefreshedToken(kind, view)` writes an SDK-refreshed token back into that server's store —
 *   so a refresh arriving during a switch/teardown lands in the correct store. The view is the SDK
 *   `AuthTokenView`, typed here as `unknown` because that type is not exported from the SDK package
 *   root — the web-core boundary casts it to its own `UserTokenView`.
 * - `onAuthExpired(kind)` runs teardown when a socket reaches the terminal `expired` state (relay vs
 *   cloud escalate differently — §6-10).
 */
export interface SocketSessionDelegate {
    getAuthRegistration(kind: SocketKind): Promise<{ token: string; authId: string } | null>;
    signAuth(kind: SocketKind, token: string, target?: string): Promise<{ signature: string; current: string }>;
    commitRefreshedToken(kind: SocketKind, view: unknown): Promise<void> | void;
    onAuthExpired?(kind: SocketKind): Promise<void> | void;
}

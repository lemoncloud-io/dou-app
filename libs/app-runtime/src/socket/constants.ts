import type { SocketState } from './types';

/**
 * The socket module's value constants — tuning and defaults.
 *
 * **Why not `types.ts`.** That file (and the other six `types.ts` in this package) declares types and
 * nothing else: measured 7/7 with zero value exports. It is also re-exported wholesale by
 * [`socket/index.ts`](./index.ts) (`export * from './types'`), so a value placed there lands on the
 * socket barrel for every internal consumer — surface creep inside the package. Values get their own
 * file so `types.ts` stays type-only and fully erasable.
 */

/**
 * SDK AuthController tuning at adoption. SDK defaults are refreshRatio 0.8 / maxFailures 5 /
 * refreshIntervalMs 30min; we override:
 *  - maxFailures 3 — a slightly faster terminal `expired` (see usage.md §1.1).
 *  - refreshIntervalMs 5min — the FALLBACK cadence used only when the socket auth response omits
 *    `expiresIn` (dev/prod currently do — §11/§6-12). The SDK schedules refresh at `expiresIn * 0.8`
 *    when present, else this interval. The 30min default is too slow: it can let the relay AWS
 *    credential (or lemon-web-core's `expired_time` = Expiration − 5min) lapse before the socket
 *    refreshes, so signed HTTP starts 403ing while the socket still reports `authenticated`. 5min
 *    stays well under the ~1h credential lifetime (and lemon's expired_time), so the socket refresh
 *    writeback keeps credentials fresh and lemon never self-refreshes (§6-12). The real fix is the
 *    server reporting `expiresIn`, which makes this fallback moot.
 */
export const AUTH_OPTIONS = { refreshRatio: 0.8, maxFailures: 3, refreshIntervalMs: 5 * 60 * 1000 } as const;

/**
 * One SDK refresh cycle — the source the credential margins are measured against.
 *
 * A healthy socket re-mints its credential every cycle, so a credential with more than a cycle left
 * will be refreshed by its owner before it lapses and needs no help; below a cycle, the socket is
 * demonstrably not keeping up. That reasoning is what `deriveAuthStatus`'s staleness margin, the
 * relay staleness guard's preemptive margin and the cloud credential guard's margin all rest on —
 * so all three read this rather than repeating `5 * 60_000`. Change the cadence above and the three
 * margins follow, which is the point: before this they would have silently gone stale while their
 * comments still claimed to be "one SDK refresh cycle".
 *
 * This file imports no runtime module, which is what lets `session/hooks/app/**` read the cadence
 * without importing `SocketManager` (and through it the SDK).
 */
export const SDK_REFRESH_CYCLE_MS = AUTH_OPTIONS.refreshIntervalMs;

/** Default upper bound for waitUntilVerified/waitUntilKindVerified when a caller does not pass one. */
export const DEFAULT_VERIFY_TIMEOUT_MS = 10_000;

/**
 * The observable state before any slot is bound, and after the last one is torn down.
 *
 * Shared rather than rebuilt per call: `SocketManager.setState` always constructs a new object
 * (`{ ...this.state, ...patch }`), so this value is only ever READ — never stored and then mutated.
 * Frozen so that stops being a convention and becomes an error.
 */
export const INITIAL_SOCKET_STATE: SocketState = Object.freeze({
    state: 'idle',
    isConnected: false,
    isVerified: false,
    connectionId: null,
});

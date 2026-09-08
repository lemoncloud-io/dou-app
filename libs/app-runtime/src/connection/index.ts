// The `connection` facade group — the host an app mounts, and the socket state it can read.
//
// React layer only: hosts, slot binders, and their hooks. Credential recovery used to be wired from
// here as an import side effect — using `RuntimeConnectionHost` was enough to get it — and the cost
// was a boot step that no entry point mentioned and that an import reshuffle could move or drop. It
// now lives in `initAppRuntime`, which is also where the wiring's ordering is stated.
//
// The binders (`SocketBinder` · `SocketReauthBinder`), `useSocketSessionDelegate`,
// `useRuntimeSocketSlots` and `deriveConnectivity` are NOT here. They are the host's own parts: it
// reaches them by concrete path, and no app has ever mounted one (ADR-0076 결정 6). This barrel used
// to `export *` the two binders, which put them on the package's public API by accident.

// Both hosts live in one module: they are the same component with guest keep-alive on/off.
export { RuntimeConnectionHost, RuntimeAuthHost } from './RuntimeConnectionHost';

// The display verdict (online · reconnecting · offline). `deriveConnectivity` behind it is the
// testable inner truth table, not public surface (ADR-0076 §deriveConnectivity is not a copy).
export { useConnectivity } from './hooks/useConnectivity';
export type { ConnectivityStatus } from './hooks/useConnectivity';

// Socket state readers: one reads the ACTIVE slot's state, the other answers "is this KIND
// verified" independently of which slot is active. Both moved here from the dissolved `runtime/`
// module (see data/index.ts's header) — they were always connection concepts.
export { useRuntimeSocketState } from './hooks/useRuntimeSocketState';
export { useKindVerified } from './hooks/useKindVerified';

// Foreground/wake kick for wedged sockets — apps call it on their own foreground signal (apps/web
// `useSocketWakeRecovery`; desktop-web keeps its local variant). See 2026-08 session audit §7 Phase 1.
export { recoverUnverifiedSockets } from '../socket/auth/recoverUnverifiedSockets';
export type { RecoverUnverifiedSocketsDeps } from '../socket/auth/recoverUnverifiedSockets';
// Injection seam for the relay-refresh primitive. The primitive itself stays internal: apps ask for
// freshness through `session.useSessionStalenessGuard`, never by calling it (ADR-0070 불변조건 1·2).
export type { RequestRelaySessionRefreshDeps } from '../socket/auth/requestRelaySessionRefresh';

// The manager handle — for a debug/lab surface that drives the socket directly.
export { getSocketManager } from '../socket/runtime';
export type { ISocketManager } from '../socket/types';

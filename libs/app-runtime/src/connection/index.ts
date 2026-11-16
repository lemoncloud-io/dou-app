// The `connection` facade group — the host an app mounts, and the socket state it can read.
//
// React layer only: the hosts and their hooks. Credential recovery used to be wired from
// here as an import side effect — using `RuntimeConnectionHost` was enough to get it — and the cost
// was a boot step that no entry point mentioned and that an import reshuffle could move or drop. It
// now lives in runtime-core's `createRuntime`, which is also where the wiring's ordering is stated.
//
// `useHostControllers` and `deriveConnectivity` are NOT here: they are the host's own parts, and
// it reaches them by concrete path. The binders and the slot derivation are not even in this package —
// they are runtime-core's connection controller, which the host starts. This barrel used to
// `export *` the two binders, which put them on the package's public API by accident.

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
export { useSlotVerified } from './hooks/useSlotVerified';
// Per cloud: whether one named cloud's socket is verified, and every cloud whose socket is — for a
// consumer that works across all of them.
export { useCloudVerified } from './hooks/useCloudVerified';
export { useVerifiedClouds } from './hooks/useVerifiedClouds';
export { RELAY_SLOT } from '@chatic/transport';

// The clouds that keep a socket session in the background. The app hands over membership; the cap
// and the order are the runtime's (the transport's `socket/backgroundClouds`).
export { useBackgroundClouds } from './hooks/useBackgroundClouds';
// The clouds the account owns, so one held as an invitee on this device is re-issued as the owner.
export { useReclaimOwnedClouds } from './hooks/useReclaimOwnedClouds';

// The sockets outside React, through the engine (`./connectionCommands`) — never the socket manager,
// which on the phone may live in another process:
// - `getRuntimeSocketState` reads the active socket at the moment of a click or a timer;
// - `waitUntilVerified` gates work on a slot's handshake;
// - `onServerEvent` / `onServerMessage` hear the server's pushes and every frame;
// - `observeSocketRequests` times requests, `getSlotStatuses` lists the slots for a debug screen;
// - `reconnectSocket`, `recoverUnverifiedSockets` and `recoverSocketsOnResume` are the wake kicks an
//   app makes on its own foreground signal (`recoverSocketsOnResume` also pings the slots that read
//   verified, so a connection left half-open by a suspension is found on resume).
export {
    getRuntimeSocketState,
    getSlotStatuses,
    observeSocketRequests,
    onServerEvent,
    onServerMessage,
    reconnectSocket,
    recoverSocketsOnResume,
    recoverUnverifiedSockets,
    waitUntilVerified,
} from './connectionCommands';
export type { SlotKey, SlotStatus, SocketRequestSample } from '@chatic/transport';
export type { SocketCloseReason } from '@chatic/transport';

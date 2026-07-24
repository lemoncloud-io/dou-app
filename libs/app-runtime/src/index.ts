// @chatic/app-runtime — shared headless chat engine (data, sync, socket, auth bootstrap).
// Engine = how the app works; presentation lives in client apps. See docs/adr/0002.
//
// This barrel is the ONLY public surface. Everything is an explicit named export so internal
// wiring (socket auth bootstrap/reauth, connection binders, low-level socket types, raw session
// actions) stays private — apps consume the hooks/components/managers below, never those internals.
// See docs/public-surface.md.

// --- Value-deriving hooks -------------------------------------------------------------------
export { useRuntimeBinding, useRuntimeRepositories, useRuntimeSocketState, useRuntimeProfile } from './runtime';
export type { SessionProfile } from './runtime';

// Back-compat aliases (pre-rename names) kept so desktop-web keeps compiling without churn while it is
// mid-refactor. New code uses the useRuntime* names above; migrate desktop-web and drop these later.
export { useRuntimeSocketState as useSocketState, useRuntimeProfile as useSessionProfile } from './runtime';

// --- Session action hooks (socket-driven site switch / logout) ------------------------------
export { useSiteSwitch, useSessionLogout, useLogoutCloudSession } from './session';

// --- Sync registration hooks ----------------------------------------------------------------
export { useChatSync, useChannelSync, usePlaceSync } from './socket';

// --- Lifecycle ------------------------------------------------------------------------------
export { RuntimeConnectionHost, RuntimeAuthHost } from './connection';
export { useDeviceTokenRegistration } from './push';
export type { DeviceTokenDelegate } from './push';

// --- Manager entry points -------------------------------------------------------------------
export { getSocketManager, getSyncManager } from './socket/runtime';
export type { ISocketManager } from './socket';

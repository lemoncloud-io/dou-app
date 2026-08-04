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

// --- Session actions (non-hook) --------------------------------------------------------------
// verify-hash-alias `$token` → web-core commit + same-connection relay socket re-auth. Consumed by
// the phone-verification flow (roadmap ADR-0033 Track A contract; Track C imports it via apps/web).
export { applySessionToken } from './socket/auth/applySessionToken';
export type { ApplySessionTokenOptions } from './socket/auth/applySessionToken';

// --- Cache tier helpers ---------------------------------------------------------------------
// Native cold-DB activation + invited-cloud durability. See docs/data/cold-db-activation-and-invite-recovery.md.
export { isNativeApp, setChatCacheLimit } from './data/factories/localFactory';
export {
    useInvitedCloudColdRecovery,
    useInvitedCloudNameSync,
    recoverInvitedCloudIfMissing,
    syncInvitedCloudName,
} from './data/invitedCloudColdSync';

// --- Sync registration hooks ----------------------------------------------------------------
export { useChatSync, useChannelSync, usePlaceSync } from './socket';

// --- Lifecycle ------------------------------------------------------------------------------
// Named (not `export *`) because connection/index.ts also re-exports deriveConnectivity, which is
// the testable inner truth table, not public surface.
export { RuntimeConnectionHost, RuntimeAuthHost, useConnectivity } from './connection';
export type { ConnectivityStatus } from './connection';
export { useDeviceTokenRegistration } from './push';
export type { DeviceTokenDelegate } from './push';

// --- Offline outbox -------------------------------------------------------------------------
// The machine only; ACTIVATION is the app's opt-in. apps/web never constructs one — it keeps its
// manual resend button, so this export cannot change mobile behaviour by existing.
export { createChatOutbox } from './data/outbox';
export type { ChatOutbox, ChatOutboxOptions, OutboxEntry, OutboxEnqueueInput } from './data/outbox';

// --- Manager entry points -------------------------------------------------------------------
export { getSocketManager, getSyncManager } from './socket/runtime';
export type { ISocketManager } from './socket';

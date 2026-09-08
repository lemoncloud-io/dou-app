// The `data` facade group — repositories, the cache tier, and the offline outbox.
//
// `useRuntimeRepositories`/`useGlobalCacheSearch` used to live in a `runtime/` module — a module
// that was not one of the engines in docs/architecture.md's table and whose six hooks each belonged
// to `data`, `connection` or `session` by consumer intent. It was dissolved once the facade made
// that mismatch explicit: the hooks now sit in the module whose group publishes them.

export { useRuntimeRepositories } from './hooks/useRuntimeRepositories';
export { useGlobalCacheSearch, globalCacheRefKey } from './hooks/useGlobalCacheSearch';

// Native cache instrumentation read/reset — the debug overlay's only view into `@chatic/db`'s
// metrics module (ADR-0070 결정 5); it never imports the engine lib directly.
export { getCacheMetricsSource } from './factories/localFactory';

// Invited-cloud durability: the name sync hook plus the two non-React halves an app runs on a
// deeplink accept.
export { useInvitedCloudNameSync } from './hooks/useInvitedCloudNameSync';
export { recoverInvitedCloudIfMissing, syncInvitedCloudName } from './invitedCloudDurability';

// The clouds query key — apps invalidate it right after login. The rest of the REST hooks went down
// to the app layer (ADR-0070 결정 5); this key stays because the runtime is what invalidates it.
export { cloudsKeys } from './hooks/queryKeys';

// The offline outbox MACHINE only; activation is the app's opt-in. apps/web never constructs one —
// it keeps its manual resend button, so this export cannot change mobile behaviour by existing.
export { createChatOutbox } from './outbox';
export type { ChatOutbox, ChatOutboxOptions, OutboxEntry, OutboxEnqueueInput } from './outbox';

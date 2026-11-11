// The `data` facade group — repositories, the cache tier, and the offline outbox.
//
// `useRuntimeRepositories`/`useGlobalCacheSearch` used to live in a `runtime/` module — a module
// that was not one of the engines in libs/app-runtime/README.md's table and whose six hooks each belonged
// to `data`, `connection` or `session` by consumer intent. It was dissolved once the facade made
// that mismatch explicit: the hooks now sit in the module whose group publishes them.

export { useRuntimeRepositories } from './hooks/useRuntimeRepositories';
// Writes addressed to a named cloud rather than the selected one: the chat send and any longer write
// (both keep that cloud's socket for as long as they are in flight), and the graph a resend queue
// reads its cloud through.
export { getCloudRepositories, sendChatInCloud, waitForCloudSocket } from '@chatic/runtime-core';
// Image messages: one send sequence for every shell, addressed to the room's cloud like the chat send.
export { useSendImages } from './hooks/useSendImages';
// How far an unsent attachment message's slots have gone — page memory, never the cache row.
export { useImageSendProgress } from './hooks/imageSendProgress';
export type {
    PreparedShellVideo,
    PrepareVideoPort,
    SendImagesOptions,
    UseSendImagesInput,
    VideoRefusal,
} from './hooks/useSendImages';
export { useGlobalCacheSearch, globalCacheRefKey } from './hooks/useGlobalCacheSearch';

// Native cache instrumentation read/reset — the debug overlay's only view into the platform cache's
// metrics module (ADR-0070 Decision 5); it never imports the engine lib directly.
export { getCacheMetricsSource } from '@chatic/runtime-core';

// Invited-cloud durability: the name sync hook plus the two non-React halves an app runs on a
// deeplink accept.
export { useInvitedCloudNameSync } from './hooks/useInvitedCloudNameSync';
export { getAcceptorId, isAcceptedBy, withAcceptor } from '@chatic/runtime-core';
export { recoverInvitedCloudIfMissing, syncInvitedCloudName } from '@chatic/runtime-core';

// Paired-cloud name: a cloud entered through a pairing has no cache row, so its name is read once per
// entry and kept beside the paired-cloud list.
export { usePairedCloudNameSync } from './hooks/usePairedCloudNameSync';
export { syncPairedCloudName } from '@chatic/runtime-core';

// The settings screen's "clear cache": every known cloud's partition, minus what only this device holds.
export { clearLocalCaches } from '@chatic/runtime-core';
export type { ClearLocalCachesResult } from '@chatic/runtime-core';
// The same next-boot cursor retirement, for a clear that does not go through `clearLocalCaches` —
// the debug panel's Storage screen empties the native cache and the WebView's storage wholesale.
export { requestSyncCursorReset } from '@chatic/runtime-core';

// The clouds query key — apps invalidate it right after login. The rest of the REST hooks went down
// to the app layer (ADR-0070 Decision 5); this key stays because the runtime is what invalidates it.
export { cloudsKeys } from './hooks/queryKeys';

// How each state write reached the server, for the web's `state_outbox` perf samples.
export { setStateOutboxObserver } from '@chatic/runtime-core';
export type { StateOutboxSample } from '@chatic/runtime-core';

// The offline outbox MACHINE only; activation is the app's opt-in. apps/web never constructs one —
// it keeps its manual resend button, so this export cannot change mobile behaviour by existing.
export { createChatOutbox } from '@chatic/runtime-core';
export type { ChatOutbox, ChatOutboxOptions, OutboxEntry, OutboxEnqueueInput } from '@chatic/runtime-core';

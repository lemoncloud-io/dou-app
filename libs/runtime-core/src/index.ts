// @chatic/runtime-core — the runtime's assembly, and the ports it is assembled from.
//
// What the React surface (`@chatic/app-runtime`) reads: the assembly entry, the data graph's
// accessors, and the non-React halves of the data facade. Apps do not import this package; they reach
// it through `runtime` from @chatic/app-runtime.

// assembly
export { createRuntime } from './createRuntime';
export type { RuntimeConfig } from './createRuntime';
export type { RuntimePorts } from './ports';
export type { RuntimeStorePorts } from './storage/runtimeStores';

// the data graph
export { getDataManager, getRepositories } from './data/runtime';
export type { DataRuntimeConfig } from './data/runtime';
export type { CacheAssemblyOptions, IDataManager } from './data/types';
export { getCacheMetricsSource, getGlobalCacheSearchSource } from './data/factories/localFactory';
export { setStateOutboxObserver } from './data/factories/outboxFactory';
export type { StateOutboxSample } from './data/factories/outboxFactory';

// writes named by cloud, and the domains the data facade publishes
export { getCloudRepositories, runInCloud, sendChatInCloud, waitForCloudSocket } from './data/cloudChat';
export { beginMediaSendTiming } from './data/mediaSendTrace';
export type { MediaSendTiming } from './data/mediaSendTrace';
export { getAcceptorId, isAcceptedBy, withAcceptor } from './data/invitedCloudAcceptance';
export { recoverInvitedCloudIfMissing, syncInvitedCloudName } from './data/invitedCloudDurability';
export { syncPairedCloudName } from './data/pairedCloudName';
export { clearLocalCaches } from './data/clearLocalCaches';
export type { ClearLocalCachesResult } from './data/clearLocalCaches';
export { requestSyncCursorReset } from './data/syncCursorWatermark';
export { createChatOutbox } from './data/outbox';
export type { ChatOutbox, ChatOutboxOptions, OutboxEntry, OutboxEnqueueInput } from './data/outbox';

// the connections, kept in line with the session
export { createConnectionController } from './connection/connectionController';
export type { ConnectionController, ConnectionControllerOptions } from './connection/connectionController';

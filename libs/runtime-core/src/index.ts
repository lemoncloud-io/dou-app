// @chatic/runtime-core — the runtime's assembly, and the ports it is assembled from.
//
// What the React surface (`@chatic/app-runtime`) reads: the assembly entry, the data graph's
// accessors, and the non-React halves of the data facade. The adapters (`@chatic/runtime-web`, the
// native one) read the assembly entry and the bridge contract. Apps do not import this package; they
// reach it through `runtime` from @chatic/app-runtime.

// assembly
export { createRuntime } from './createRuntime';
export type { RuntimeConfig } from './createRuntime';
export type { CredentialGuard, PushRegistrar, RuntimeEngine } from './engine';
export type { RuntimePorts } from './ports';
export type { RuntimeStorePorts } from './storage/runtimeStores';
export type { ForegroundSignal } from './session/foreground';

// the data graph
export { getDataManager, getRepositories } from './data/runtime';
export type { DataRuntimeConfig } from './data/runtime';
export type { CacheAssemblyOptions, IDataManager } from './data/types';
export { getCacheMetricsSource, getGlobalCacheSearchSource } from './data/factories/localFactory';
export { setStateOutboxObserver } from './data/factories/outboxFactory';
export type { StateOutboxSample } from './data/factories/outboxFactory';

// writes named by cloud, and the domains the data facade publishes
export { getCloudRepositories, sendChatInCloud, waitForCloudSocket } from './data/cloudChat';
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

// the connections, kept in line with the session, and the sockets as screens read and drive them
export type { ConnectionController, ConnectionControllerOptions } from './connection/connectionController';
export type { ConnectionSnapshot, RuntimeConnection } from './connection/runtimeConnection';
// The relay's slot key, as `ConnectionSnapshot.verifiedSlots` names it.
export { RELAY_SLOT } from '@chatic/transport';

// the sync engine as screens drive it
export type { RuntimeSync } from './sync/runtimeSync';

// the data as screens read and write it: the page's repository graph, without the token issuers
export type { RuntimeData } from './data/runtimeData';
export type { PageAuthRepository, PagePairingRepository, PageRepositories } from './data/pageRepositories';
export { PAGE_REPOSITORY_REFUSED, TOKEN_ISSUING_AUTH_METHODS } from './data/pageRepositories';
export {
    DATA_CALL_METHODS,
    DATA_STREAMS,
    DATA_CLOUD_TARGET,
    DATA_TARGET,
    REPOSITORY_CALL_METHODS,
    REPOSITORY_METHODS,
    REPOSITORY_RECEIPTS,
    REPOSITORY_STREAMS,
} from './bridge/repositories';

// the session as screens read it: a snapshot without tokens
export type {
    ActiveServerView,
    CloudSessionView,
    IdentityView,
    PairingView,
    RelaySessionView,
    SessionAuthView,
    SessionContextView,
    SessionSnapshot,
    SessionUserView,
    SessionView,
} from './session/snapshot';

// everything a screen does to the session, and the commands a runtime call may name
export type { SessionCommands } from './session/commands';

// the relay session's own lifecycle: boot, and the guest keep-alive
export type { SessionController, SessionControllerOptions } from './session/sessionController';
export { prepareSecretStorage } from './session/secretStorage';
export type { SecretStorageBoot, SecretStorageOutcome } from './session/secretStorage';

// the credential guards an app starts with its own policy
export type { SessionStalenessPolicy } from './session/relayCredentialGuard';
export type { CloudCredentialPolicy } from './session/cloudCredentialGuard';

// push registration, which an app starts with its shell's delegate
export type { DeviceTokenDelegate, PushDeviceIds, PushRegistrationOptions } from './push/pushRegistration';

// a chat room primed for its first render
export type { ChatPrimeOutcome, PrimeChatRoomOptions } from './sync/primeChatRoom';

// the runtime across the bridge: the contract version both halves negotiate, and how errors cross
export {
    RUNTIME_CONTRACT_VERSION,
    RUNTIME_CONTRACTS,
    CONNECTION_CALL_METHODS,
    CONNECTION_LOCAL_MEMBERS,
    CONNECTION_STREAMS,
    CONNECTION_TARGET,
    SESSION_COMMANDS_TARGET,
    SESSION_CHANGE_SIGNAL,
    SESSION_COMMAND_METHODS,
    SESSION_LOGOUT_SIGNAL,
    SYNC_CALL_METHODS,
    SYNC_STREAMS,
    SYNC_TARGET,
    VIEW_STREAMS,
    answerRuntimeHello,
    chooseRuntimeContract,
    readRuntimeOffer,
    settleRuntimeHello,
} from './bridge/contract';
export type { RuntimeHelloHost, RuntimeHelloOutcome, RuntimeSettlement, SessionSnapshotWire } from './bridge/contract';
export {
    RUNTIME_ERROR_CODE,
    RUNTIME_NOT_AVAILABLE_CODE,
    reviveRuntimeError,
    runtimeNotAvailableFailure,
    serializeRuntimeError,
    toRuntimeFailure,
} from './bridge/errors';
export type { RuntimeErrorDetails } from './bridge/errors';
export {
    DEFAULT_RUNTIME_HELLO_WAIT_MS,
    DEFAULT_RUNTIME_PAYLOAD_LIMIT,
    RUNTIME_CONTRACT_MISMATCH_CODE,
    RUNTIME_LISTENER_MARKER,
    RUNTIME_NOT_STARTED_CODE,
    RUNTIME_PAYLOAD_TOO_LARGE_CODE,
    RUNTIME_STARTING_CODE,
    createRuntimeBridgeHost,
} from './bridge/host';
export type {
    RuntimeBridgeHost,
    RuntimeBridgeHostOptions,
    RuntimeHostAnswer,
    RuntimeHostSend,
    RuntimePayloadSample,
} from './bridge/host';
// What a sub WebView page may ask of the runtime: a whitelist of read methods, by permission.
export {
    SUB_WEB_VIEW_ALLOWED,
    SUB_WEB_VIEW_DATA_MEMBER_WHITELIST,
    SUB_WEB_VIEW_REPOSITORY_WHITELIST,
    SUB_WEB_VIEW_TARGETS,
    checkSubWebViewRuntimeRequest,
    subWebViewAllowedFor,
} from './bridge/subWebViewWhitelist';
export type {
    SubWebViewAllow,
    SubWebViewArgGuard,
    SubWebViewDecision,
    SubWebViewDeny,
    SubWebViewDenyReason,
    SubWebViewReadCost,
    SubWebViewRuntimeCheck,
    SubWebViewRuntimeRequest,
    SubWebViewRuntimeScope,
    SubWebViewWhitelistEntry,
} from './bridge/subWebViewWhitelist';
export { createMirrorEngine } from './bridge/mirror/mirrorEngine';
export type { MirrorEngine, MirrorEngineOptions } from './bridge/mirror/mirrorEngine';
export type { RuntimeMirrorPort } from './bridge/mirror/port';

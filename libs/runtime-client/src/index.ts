// @chatic/runtime-client — the side of the React surface that calls the core.
//
// `@chatic/runtime` is what apps render against; this package is the half of it that needs no UI
// library: the engine holder an app's entry point fills, the host ports it publishes, the commands
// and reads that go through that engine, and the plain functions @chatic/runtime's hooks wrap. No
// `react`, `@tanstack/*` or `zustand` here — the root lint's `layer:client` constraint refuses them —
// so every hook, component and query key stays in @chatic/runtime, and what is left is code that
// would run unchanged under another UI.
//
// Apps never import this package. They reach every name below through `runtime` from
// `@chatic/runtime`, which re-exports the ones it sells; the rest are @chatic/runtime's own wiring.

// --- the engine holder ---------------------------------------------------------------------------
export { initAppRuntime, resetRuntimeEngine, runtimeEngine } from './init';
export { discardWebSessionCopy, hasWebSessionCopy, prepareSecretStorage } from './sessionStorageBoot';

// --- the declaration: an app names its adapters per port, and the start builds the runtime from them ---
// Unlike the rest of this barrel, apps do reach these — through `@chatic/runtime-web` or
// `@chatic/runtime-mobile`, which hand them on beside their own adapters.
export {
    PORT_NAMES,
    RUNTIME_PORT_LOG_TAG,
    RuntimeDeclarationError,
    conflicts,
    defineAdapter,
    defineEngineAdapter,
    defineHostAdapter,
    defineRuntime,
    engineCore,
    formatPortChoice,
    requires,
    resolveEngine,
    resolveHostPorts,
    resolvePorts,
    startRuntime,
} from './declare';
export type {
    Adapter,
    AdapterContext,
    AdapterId,
    AdapterOf,
    AdapterRef,
    ChoiceLane,
    ChoiceOrigin,
    EngineAdapter,
    EngineContext,
    EngineDeclaration,
    EngineOutcome,
    HostAdapter,
    HostPortChoices,
    HostPortDeclaration,
    HostPortDeclarations,
    HostPortName,
    PortChoice,
    PortChoiceKey,
    PortChoiceReader,
    PortChoiceSummary,
    PortChoices,
    PortConstraint,
    PortDeclaration,
    PortName,
    PortNamesAreComplete,
    RuntimeConfigAccess,
    RuntimeDeclaration,
    SessionOwnerSide,
    SlotName,
    StartRuntimeOptions,
    StartedRuntime,
} from './declare';

// --- connection: the sockets through the engine ------------------------------------------------------
export {
    getRuntimeSocketState,
    getSlotStatuses,
    observeSocketRequests,
    onServerEvent,
    onServerMessage,
    readConnection,
    reconnectSocket,
    recoverSocketsOnResume,
    recoverUnverifiedSockets,
    runtimeConnection,
    subscribeConnection,
    waitUntilVerified,
} from './connection/connectionCommands';
export { deriveConnectivity, readOnlineSignal } from './connection/connectivity';
export type { ConnectivitySignals, ConnectivityStatus } from './connection/connectivity';

// --- data: repositories, the cache and its writes through the engine ---------------------------------
export {
    clearLocalCaches,
    getAcceptorId,
    getCacheMetricsSource,
    getCloudRepositories,
    holdCloud,
    recoverInvitedCloudIfMissing,
    requestSyncCursorReset,
    resolveCacheContext,
    runtimeData,
    searchCache,
    sendChatInCloud,
    setStateOutboxObserver,
    syncInvitedCloudName,
    syncPairedCloudName,
    waitForCloudSocket,
} from './data/dataCommands';
export { withCloudHold } from './data/cloudHold';
export { createInvitedCloudNameSync, createPairedCloudNameSync } from './data/cloudNameSync';
export type { CloudNameSyncPass } from './data/cloudNameSync';

// --- session: reads, commands, lookups --------------------------------------------------------------
export {
    getActiveServerContext,
    getActiveSessionUser,
    getCommittedSessionSiteId,
    getGlobalSessionContext,
    getIdentityContext,
    getRelaySessionUser,
    getUidInCloud,
    isInOwnCloudSession,
    isPairedSession,
    readSession,
    subscribeSession,
} from './session/sessionReads';
export {
    cancelPhoneLogin,
    clearSiteSelection,
    confirmPhoneLogin,
    createCredentialsByProvider,
    fetchAccountProfile,
    forgetInviteLogin,
    forgetRefusedPairedCloud,
    logoutSession,
    patchRelaySessionUser,
    registerUserWithInviteCode,
    retryPhoneLogin,
    sessionCommands,
    updateAccountProfile,
} from './session/sessionCommands';
export { fetchInviteInfoWithCode, findAlias, registerUser, registerUserV2, verifyAlias } from './session/authLookups';
export { registerSessionLogoutCallback } from './session/logoutCallbacks';
export { lazySessionDeviceId, readSessionDeviceId } from './session/deviceId';
export { createPairedCloudCheck, createPairingRequestFlow } from './session/pairing';
export type { PairingRequestScreen } from './session/pairing';

// --- sync: the sync engine as the app drives it -----------------------------------------------------
export {
    fetchRoomFeed,
    isChannelRefused,
    listSyncTargets,
    prefetchRoomFeed,
    primeChatRoom,
    refreshBackgroundClouds,
    registerSyncTarget,
    runtimeSync,
    subscribeBackgroundDeltas,
    subscribeRefusedChannels,
    syncTargetKey,
    updateSyncSnapshot,
} from './sync/syncCommands';

// --- diagnostics: the user's issue report and the log-batch upload ---------------------------------
export { submitIssueReport } from './diagnostics/reportIssue';
export { uploadLogBatch } from './diagnostics/logBatch';
export type { AppType, IssueReportExtras, IssueReportOrigin } from './diagnostics/types';

// --- the host: the capability ports the entry point publishes and features read ---------------------
// The contracts, and the one holder `host` that the entry point publishes into. `@chatic/runtime` hands
// the published ports out as `runtime.<port>` through the bindings below, which are live: each reads
// what `host.publish` assigned, so `runtime.checkout` and `host.ports.checkout` are the same object.
// The reading of the shell's declaration that chooses them is a web page's, in `@chatic/runtime-web`.
export {
    appShellPort,
    checkoutPort,
    diagnosticsPort,
    filesPort,
    host,
    HOST_PORT_NAMES,
    HostFacade,
    linksPort,
    mediaPort,
    pushDeviceToken,
    pushKind,
    pushLocalBanner,
    pushNotifications,
    pushTokenRenewal,
    signInPort,
} from './host';
export type {
    AlternateAppIcon,
    AppAttachmentPicker,
    AppFileTransfers,
    AppShellHaptics,
    AppShellPort,
    BootMetricsSink,
    CameraPermission,
    CheckoutMethod,
    CheckoutPort,
    ContactsBook,
    DevicePhotoLibrary,
    DeviceTokenRenewal,
    DeviceTokenSource,
    DiagnosticsEntry,
    DiagnosticsPort,
    FilesMethod,
    FilesPort,
    HandoffLinks,
    HostDebugMode,
    HostOs,
    HostPorts,
    LinkPreviewReader,
    LinksPort,
    LocalBanner,
    MediaMethod,
    MediaPort,
    NoCheckout,
    NotificationFeed,
    PaintableDockBadge,
    PendingReportQueue,
    ProviderSignIn,
    PushPort,
    ReadableIconBadge,
    RelayOAuth,
    SelfUpdate,
    ShareIntakeSource,
    ShareSheet,
    ShellBackGesture,
    ShellOrBrowser,
    ShellPreferenceStore,
    SignInPort,
    SmsComposer,
    StoreCheckout,
    StoreName,
    StorePurchase,
    StorePurchaseError,
    StorePurchaseRequest,
    StoreUpdate,
    SubWebViewOpener,
    SystemSettingsPage,
    VideoConverter,
    WebCheckout,
} from './host';

// --- settings: the config facade's values, snapshots and writes, as the call part reads them ---------
export {
    clearSetting,
    getSetting,
    isSettingsInitialized,
    overriddenSettingSnapshots,
    setSetting,
    settingSnapshot,
    settingSnapshots,
    subscribeSettings,
} from './settings/settings';

// --- the core's names @chatic/runtime's hooks use ------------------------------------------------------
// Handed on unchanged, so a hook takes the core through this package alone. Constants and pure
// helpers only: anything that drives the runtime is one of the functions above.
export { RELAY_SLOT, slotKeyOf } from '@chatic/transport';
export type { SlotKey, SocketState } from '@chatic/transport';
export {
    chatAttachmentSourceFormat,
    globalCacheRefKey,
    IMAGE_MESSAGE_SLOT_MAX,
    isPendingUploadSlot,
    isShellFileRef,
    judgeChatAttachments,
    RELAY_CLOUD_ID,
    sendImageMessage,
} from '@chatic/data';
export type {
    ChatAttachmentSource,
    ChatMentionBody,
    ChatUploadKind,
    DomainUser,
    GlobalCacheContext,
    GlobalCacheRef,
    GlobalCacheSearchResult,
    PendingFileDetails,
    PreparedImageMirror,
    PutPort,
    PutProgress,
    PutResult,
    SendImagePorts,
    SendImageResult,
    ShellFilePutPort,
    ShellFileRef,
    UploadPutTarget,
} from '@chatic/data';
export { beginMediaSendTiming } from '@chatic/runtime-core';
export type {
    CloudCredentialPolicy,
    ConnectionController,
    DeviceTokenDelegate,
    MediaSendTiming,
    PageRepositories,
    SessionController,
    SessionStalenessPolicy,
} from '@chatic/runtime-core';
export { PAIRED_CLOUD_CHECK_INTERVAL_MS } from '@chatic/auth';
export type {
    FindAliasBody,
    FindAliasView,
    InviteLogin,
    LogoutOptions,
    PairingRequestFlow,
    PairingRequestState,
    SessionAccountView,
    VerifyAliasBody,
    VerifyAliasView,
} from '@chatic/auth';
export type { SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';

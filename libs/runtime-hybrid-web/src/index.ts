export * from '@chatic/runtime-web';

export { RUNTIME_CALL_TIMEOUT_MS, createBridgedRuntime, webMirrorPort } from './createBridgedRuntime';
export type { BridgedRuntimeOptions } from './createBridgedRuntime';
export {
    SESSION_OWNER_GIVE_UP_MS,
    SESSION_OWNER_HELLO_TIMEOUT_MS,
    SESSION_OWNER_LAST_HELLO_MIN_MS,
    settleSessionOwner,
    visibleClock,
} from './settleSessionOwner';
export type { SessionOwnerChoice, SessionOwnerOptions } from './settleSessionOwner';

export { chooseCandidate, logHybridChoice } from './candidates';
export type { Candidate, CandidateChoice } from './candidates';

export {
    LATE_VAULT_MARK,
    STORAGE_CANDIDATES,
    readStorageEnvironment,
    resolveStorageStores,
} from './storage/resolveStorageStores';
export type { StorageCandidate, StorageEnvironment, StorageMedium } from './storage/resolveStorageStores';
export { createShellVault } from './storage/shellVault';
export type { ShellVaultOptions } from './storage/shellVault';

export {
    CACHE_DOMAIN_CANDIDATES,
    chooseCacheBackendFor,
    readNativeCacheSupport,
    routedCachePorts,
    setNativeCacheSupport,
    shellSqliteCache,
    webLocalCachePorts,
} from './localCache';
export type {
    CacheBackend,
    CacheBackendCandidate,
    CacheDomainContext,
    NativeCacheReport,
    NativeCacheSupport,
    RoutedCachePortsOptions,
    ShellSqliteCacheOptions,
} from './localCache';

export { readWebHostFacts } from './hostFacts';
export type { WebHostFactsSources } from './hostFacts';

export {
    CHECKOUT_INTRODUCED_IN,
    FILES_INTRODUCED_IN,
    MEDIA_INTRODUCED_IN,
    SHELL_DOMAINS_INTRODUCED_IN,
    hostOsOf,
    offeredCheckoutMethods,
    offeredStore,
    resolveAppShell,
    resolveCheckoutMethod,
    resolveDiagnosticsMethod,
    resolveFilesMethod,
    resolveLinksMethod,
    resolveMediaMethod,
    resolvePushMethod,
    resolveShellOrBrowser,
    resolveSignIn,
    readShellHarness,
    SHELL_HARNESS_GLOBAL,
    shellCheckoutUrl,
} from './hostCapabilities';
export type { DeclaredHost, OfferedCheckoutMethod, ShellHarness } from './hostCapabilities';

export { startRuntime } from './platform/startRuntime';
export { webPlatform } from './platform/webPlatform';

export {
    appShellAdapters,
    cacheShellSqlite,
    cacheWebStorage,
    checkoutFromHost,
    checkoutNone,
    checkoutStore,
    checkoutWeb,
    diagnosticsAdapters,
    engineCandidates,
    engineLocal,
    engineMirror,
    engineShell,
    filesAdapters,
    linksAdapters,
    mediaAdapters,
    pushAdapters,
    signInAdapters,
    storageVault,
    transportBrowser,
    webHostFacts,
} from './adapters';
export type {
    CheckoutImplementations,
    EngineCandidate,
    EngineCandidateOutcome,
    EngineMirrorOptions,
    EngineShellOptions,
    ShellOrBrowserAdapters,
    ShellOrBrowserBase,
    ShellOrBrowserImplementations,
    WebHostAdapter,
} from './adapters';

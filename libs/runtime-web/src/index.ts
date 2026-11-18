// @chatic/runtime-web — the runtime for a web page: its ports, and the stores a page keeps state in.

// the runtime, built from the page's ports
export { createWebRuntime } from './createWebRuntime';
export type { WebRuntimeOptions } from './createWebRuntime';

// the engine of a page that mirrors its phone shell's runtime
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

// the stores an app keeps state in, chosen for its environment
export { LATE_VAULT_MARK, readStorageEnvironment, resolveStorageStores } from './storage/resolveStorageStores';
export type { StorageEnvironment } from './storage/resolveStorageStores';

// the phone shell's cache capability, reported after the bridge handshake
export { setNativeCacheSupport } from './localCache';
export type { NativeCacheSupport } from './localCache';

// what the page knows about its host at boot, as one value
export { readWebHostFacts } from './hostFacts';
export type { WebHostFacts, WebHostFactsSources } from './hostFacts';

// what the shell declared it does, read into the host ports the entry point publishes (`host.publish`);
// features read the published ports as `runtime.<port>` from `@chatic/runtime`
export {
    CHECKOUT_INTRODUCED_IN,
    FILES_INTRODUCED_IN,
    MEDIA_INTRODUCED_IN,
    SHELL_DOMAINS_INTRODUCED_IN,
    hostOsOf,
    resolveAppShell,
    resolveCheckoutMethod,
    resolveDiagnosticsMethod,
    resolveFilesMethod,
    resolveLinksMethod,
    resolveMediaMethod,
    resolvePushMethod,
    resolveShellOrBrowser,
    resolveSignIn,
} from './hostCapabilities';
export { host } from '@chatic/runtime-client';
export type {
    AppShellPort,
    CheckoutMethod,
    CheckoutPort,
    DiagnosticsPort,
    FilesMethod,
    FilesPort,
    HostOs,
    HostPorts,
    LinksPort,
    MediaMethod,
    MediaPort,
    NoCheckout,
    PushPort,
    ShellOrBrowser,
    SignInPort,
    StoreCheckout,
    StoreName,
    StorePurchase,
    StorePurchaseError,
    StorePurchaseRequest,
    WebCheckout,
} from '@chatic/runtime-client';

// each port's pieces, one factory each, every one buildable on its own from what it is handed —
// `createWebRuntime` and `resolveStorageStores` are the same factories, chosen for the page
export { webTransportPorts } from './transport';
export type { WebTransportOptions } from './transport';
export { webAuthPorts } from './auth';
export type { PageLocation } from './auth';
export { webForegroundPorts } from './foreground';
export type { VisibilitySource } from './foreground';
export {
    createShellVault,
    localStorageStores,
    pageStorageAreas,
    tabStorageStores,
    vaultStorageStores,
} from './storage/storeSets';
export type { ShellVaultOptions, StorageStores, VaultStorageOptions, WebStorageAreas } from './storage/storeSets';
export {
    indexedDbCache,
    readNativeCacheSupport,
    routedCachePorts,
    sharedIndexedDbDatabase,
    shellSqliteCache,
    webLocalCachePorts,
    webStorageCache,
} from './localCache';
export type {
    IndexedDbCacheOptions,
    NativeCacheReport,
    RoutedCachePortsOptions,
    SearchableWebCacheStore,
    ShellSqliteCacheOptions,
    WebCacheStore,
    WebStorageCacheOptions,
} from './localCache';

// the declaration: a web app names its adapters per port and starts the runtime from them
export { conflicts, defineAdapter, defineRuntime, requires, startRuntime } from '@chatic/runtime-client';
export type {
    Adapter,
    ChoiceLane,
    ChoiceOrigin,
    PortChoice,
    PortChoices,
    PortConstraint,
    PortDeclaration,
    PortName,
    RuntimeDeclaration,
    StartRuntimeOptions,
    StartedRuntime,
} from '@chatic/runtime-client';
// the adapters a web declaration plugs in, each named after its id (`cache.indexeddb` → `cacheIndexedDb`)
export {
    authLocation,
    cacheIndexedDb,
    cacheShellSqlite,
    cacheWebStorage,
    foregroundVisibility,
    storageLocal,
    storageTab,
    storageVault,
    transportBrowser,
    webHostFacts,
} from './adapters';
export type { WebAdapter } from './adapters';

// a page's own upload sender
export { createXhrPut, xhrPut } from './xhrPut';

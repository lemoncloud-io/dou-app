export { BROWSER_HOST_FACTS } from './hostFacts';
export type { WebHostFacts } from './hostFacts';

export { host } from '@chatic/runtime-client';
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
} from '@chatic/runtime-client';

export { webTransportPorts } from './transport';
export type { WebTransportOptions } from './transport';
export { webAuthPorts } from './auth';
export type { PageLocation } from './auth';
export { webForegroundPorts } from './foreground';
export type { VisibilitySource } from './foreground';
export { localStorageStores, pageStorageAreas, tabStorageStores, vaultStorageStores } from './storage/storeSets';
export type { StorageStores, VaultStorageOptions, WebStorageAreas } from './storage/storeSets';
export {
    browserCachePorts,
    browserCacheRouteFor,
    indexedDbCache,
    sharedIndexedDbDatabase,
    webLocalCachePorts,
    webStorageCache,
} from './localCache';
export type {
    BrowserCachePortsOptions,
    BrowserCacheRoute,
    IndexedDbCacheOptions,
    SearchableWebCacheStore,
    WebCacheStore,
    WebStorageCacheOptions,
} from './localCache';

export {
    conflicts,
    defineAdapter,
    defineEngineAdapter,
    defineHostAdapter,
    defineRuntime,
    engineCore,
    requires,
} from '@chatic/runtime-client';
export { startRuntime, startRuntimeOn } from './platform/startRuntime';
export {
    allModules,
    cacheModule,
    headlessModules,
    httpModule,
    minimalModules,
    pushModule,
    sessionModule,
    socketsModule,
    syncModule,
} from '@chatic/runtime/modules';
export type { ModuleName, RuntimeModule, RuntimeModules, RuntimeOf } from '@chatic/runtime/modules';
export { webPlatform } from './platform/webPlatform';
export type {
    Adapter,
    ChoiceLane,
    ChoiceOrigin,
    EngineAdapter,
    EngineDeclaration,
    EngineOutcome,
    HostAdapter,
    HostPortChoices,
    HostPortDeclaration,
    HostPortDeclarations,
    HostPortName,
    PortChoice,
    PortChoices,
    PortConstraint,
    PortDeclaration,
    PortName,
    RuntimeDeclaration,
    SessionOwnerSide,
    StartRuntimeOptions,
    StartedRuntime,
} from '@chatic/runtime-client';
export {
    authLocation,
    cacheIndexedDb,
    cacheWebStorage,
    foregroundVisibility,
    storageLocal,
    storageTab,
    tabStoreOf,
    transportBrowser,
    webHostFacts,
} from './adapters';
export type { WebAdapter } from './adapters';
export { pageLinks } from './adapters';

export { createXhrPut, xhrPut } from './xhrPut';

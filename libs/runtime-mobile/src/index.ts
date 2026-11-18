// @chatic/runtime-mobile — the runtime for React Native's JS process: the native ports, as the adapters an
// app's runtime declaration plugs in. The globals it needs are a separate entry,
// `@chatic/runtime-mobile/polyfills`, imported first.

// the ports, one factory each, every one buildable on its own from what it is handed
export { nativeTransportPorts } from './transport';
export type { NativeDeviceOptions } from './transport';
export { nativeForegroundPorts } from './foreground';
export type { AppStateSource } from './foreground';
export { nativeAuthPorts } from './auth';
export type { NativeAuthOptions } from './auth';
export { NATIVE_CACHE_ROUTE, nativeLocalCachePorts } from './localCache';
export {
    NATIVE_VAULT_TIMEOUT_MS,
    keyValueStoreOn,
    nativeSecretStore,
    nativeStoragePorts,
    waitForUnlockedVault,
} from './storage';
export type {
    DeviceVault,
    KeyValueFile,
    NativeSecretStoreOptions,
    NativeStorageOptions,
    NativeStoragePorts,
} from './storage';

// what the process knows about its host, read once at boot
export { readNativeHostFacts } from './hostFacts';
export type { NativeHostFacts, NativeHostFactsOptions, PlatformSource } from './hostFacts';

// what a start checks first: the build values, then the vault and the secret-storage step
export {
    NATIVE_RUNTIME_ENV_KEYS,
    NativeRuntimeEnvError,
    NativeRuntimeNoSessionError,
    loadNativeSession,
    missingNativeRuntimeEnv,
} from './boot';
export type { NativeRuntimeBoot, NativeSessionLoad } from './boot';
export { NATIVE_RELAY_GUARD_POLICY, runNativeRuntime } from './run';
export type { NativeRuntimeRunOptions } from './run';

// the declaration: the app names its adapters per port and starts the runtime from them
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
// the adapters a mobile declaration plugs in, each named after its id (`cache.mobile-sqlite` → `cacheMobileSqlite`)
export {
    authMobile,
    cacheMobileSqlite,
    foregroundAppState,
    mobileHostFacts,
    storageMobileVault,
    transportMobile,
} from './adapters';
export type { MobileAdapter, MobileAuthOptions, MobileVaultStorageOptions } from './adapters';

// the shell's half of the runtime across the bridge
export { RUNTIME_CONTRACTS, RUNTIME_LISTENER_MARKER, createRuntimeBridgeHost } from '@chatic/runtime-core';
// For the app's vault bridge: a page's logout whose clear the vault refused has to reach the runtime's boot.
export { setSecretLogoutPending } from '@chatic/runtime-core';
export type { RuntimeBridgeHost, RuntimeHostAnswer, RuntimePayloadSample } from '@chatic/runtime-core';

// what a sub WebView page may ask of the runtime, for the shell's page host
export { checkSubWebViewRuntimeRequest, subWebViewAllowedFor } from '@chatic/runtime-core';
export type { RuntimeEngine, SubWebViewRuntimeCheck, SubWebViewWhitelistEntry } from '@chatic/runtime-core';

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

export { readNativeHostFacts } from './hostFacts';
export type { NativeHostFacts, NativeHostFactsOptions, PlatformSource } from './hostFacts';

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
export {
    authMobile,
    cacheMobileSqlite,
    foregroundAppState,
    mobileHostFacts,
    storageMobileVault,
    transportMobile,
} from './adapters';
export type { MobileAdapter, MobileAuthOptions, MobileVaultStorageOptions } from './adapters';

export { RUNTIME_CONTRACTS, RUNTIME_LISTENER_MARKER, createRuntimeBridgeHost } from '@chatic/runtime-core';
export { setSecretLogoutPending } from '@chatic/runtime-core';
export type { RuntimeBridgeHost, RuntimeHostAnswer, RuntimePayloadSample } from '@chatic/runtime-core';

export { SUB_WEB_VIEW_ALLOWED, checkSubWebViewRuntimeRequest, subWebViewAllowedFor } from '@chatic/runtime-core';
export type { RuntimeEngine, SubWebViewRuntimeCheck, SubWebViewWhitelistEntry } from '@chatic/runtime-core';

// @chatic/runtime-mobile — the runtime for React Native's JS process: the native ports, and the
// assembly built from them. The globals it needs are a separate entry, `@chatic/runtime-mobile/polyfills`,
// imported first.

// the runtime, built from the native ports
export { createNativeRuntime } from './createNativeRuntime';
export type { NativeRuntimeOptions } from './createNativeRuntime';

// the ports the app builds on its own native storage
export { NATIVE_CACHE_ROUTE, nativeLocalCachePorts } from './localCache';
export { NATIVE_VAULT_TIMEOUT_MS, keyValueStoreOn, nativeSecretStore, waitForUnlockedVault } from './storage';
export type { DeviceVault, KeyValueFile, NativeSecretStoreOptions } from './storage';

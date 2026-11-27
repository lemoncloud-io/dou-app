export type { KeyValueStore, StoreName } from '@chatic/storage-compose';
export { TolerantStore, SwitchableStore, DomStorageAdapter, asDomStorage } from '@chatic/storage-compose';
export { MemoryStore } from '@chatic/storage-memory';
export { WebStore } from '@chatic/storage-web-local';
export type {
    NativeStore,
    NativeReadResult,
    NativeSecureStoreOptions,
    NativeStorageChannel,
} from '@chatic/storage-vault-bridge';
export { NativeSecureStore, isNativeStore } from '@chatic/storage-vault-bridge';

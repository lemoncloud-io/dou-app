export { BaseDbAdapter } from '@chatic/data';

export {
    IndexedDBDatabase,
    TYPE_CID_UID_INDEX,
    CHAT_PAGINATION_INDEX,
    UNSENT_CHAT_NO,
    ChatQueryExecutor,
    IndexedDBAdapter,
    isQuotaExceededError,
    IndexedDbGlobalSearchSource,
} from '@chatic/db-indexeddb';
export type { IndexedDBAdapterOptions } from '@chatic/db-indexeddb';

export { WebStorageAdapter } from './webStorageAdapter';

export {
    NativeDBAdapter,
    getNativeCacheMetrics,
    recordNativeCacheOperation,
    resetNativeCacheMetrics,
    NativeCacheMetricsSource,
    NativeGlobalSearchSource,
} from '@chatic/db-bridge';
export type {
    NativeDBAdapterOptions,
    OptionalNativeCacheMessage,
    CacheBridgeClient,
    NativeCacheOperation,
    NativeCacheOperationStat,
} from '@chatic/db-bridge';

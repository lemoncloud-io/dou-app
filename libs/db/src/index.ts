export { BaseDbAdapter } from './base/BaseDbAdapter';

export {
    IndexedDBDatabase,
    TYPE_CID_UID_INDEX,
    CHAT_PAGINATION_INDEX,
    UNSENT_CHAT_NO,
} from './indexeddb/IndexedDBDatabase';
export { ChatQueryExecutor } from './indexeddb/ChatQueryExecutor';
export { IndexedDBAdapter, isQuotaExceededError } from './indexeddb/IndexedDBAdapter';
export type { IndexedDBAdapterOptions } from './indexeddb/IndexedDBAdapter';

export { NativeDBAdapter, resetNativeBatchReadSupport, resetNativeLastChatsSupport } from './native/NativeDBAdapter';
export {
    getNativeCacheMetrics,
    recordNativeCacheOperation,
    resetNativeCacheMetrics,
    NativeCacheMetricsSource,
} from './native/nativeCacheMetrics';
export type { NativeCacheOperation, NativeCacheOperationStat } from './native/nativeCacheMetrics';

export { IndexedDbGlobalSearchSource } from './search/IndexedDbGlobalSearchSource';
export { NativeGlobalSearchSource } from './search/NativeGlobalSearchSource';

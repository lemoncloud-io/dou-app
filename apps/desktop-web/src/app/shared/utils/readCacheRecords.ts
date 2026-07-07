/**
 * Read every record from the engine's IndexedDB cache (read-only). The repository
 * layer is scoped to the ACTIVE cloud's partition and exposes no cross-partition
 * query, so cross-cloud push resolvers (channel → cloud, sender → nick) scan the
 * raw store directly. Each record carries its `type` discriminator, `cid`
 * partition, and the domain payload under `data`. Returns [] when IndexedDB is
 * unavailable so callers degrade gracefully.
 */
const DB_NAME = 'ChaticWebCacheDB';
const STORE_NAME = 'cache_store';

export interface CacheRecord<TData = Record<string, unknown>> {
    type?: string;
    cid?: string;
    data?: TData;
}

export const readCacheRecords = async <TData = Record<string, unknown>>(): Promise<CacheRecord<TData>[]> => {
    if (typeof indexedDB === 'undefined') return [];
    try {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(DB_NAME);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            return await new Promise<CacheRecord<TData>[]>((resolve, reject) => {
                const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
                request.onsuccess = () => resolve(request.result ?? []);
                request.onerror = () => reject(request.error);
            });
        } finally {
            db.close();
        }
    } catch {
        return []; // cache unavailable → caller degrades
    }
};

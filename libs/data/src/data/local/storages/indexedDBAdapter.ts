import type { CacheModelMap, CacheTtlMeta, CacheType } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories';
import type { CacheSchema, CacheStorage } from './cacheStorage';
import { createTtlMeta, isExpired, resolveScopedContext, withCacheMeta } from './utils';

const DB_NAME = 'ChaticWebCacheDB';
const DB_VERSION = 2;
const STORE_NAME = 'cache_store';
const TYPE_CID_UID_INDEX = 'type_cid_uid';

const promisifyRequest = <T>(request: IDBRequest<T>): Promise<T> =>
    new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

const promisifyTransaction = (transaction: IDBTransaction): Promise<void> =>
    new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(new Error('Transaction aborted'));
    });

/** Cached DB connection — reused across all operations to avoid connection exhaustion in WKWebView. */
let cachedDBPromise: Promise<IDBDatabase> | null = null;

const openDB = (): Promise<IDBDatabase> => {
    if (cachedDBPromise) return cachedDBPromise;

    cachedDBPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = event => {
            const db = (event.target as IDBOpenDBRequest).result;
            let store: IDBObjectStore;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            } else {
                const transaction = (event.target as IDBOpenDBRequest).transaction;
                if (!transaction) return;
                store = transaction.objectStore(STORE_NAME);
            }

            if (store.indexNames.contains('type_cid')) {
                store.deleteIndex('type_cid');
            }

            if (!store.indexNames.contains(TYPE_CID_UID_INDEX)) {
                store.createIndex(TYPE_CID_UID_INDEX, ['type', 'cid', 'uid'], { unique: false });
            }
        };
        request.onsuccess = () => {
            const db = request.result;
            // If the connection is closed unexpectedly (e.g. by the browser/WKWebView),
            // reset the cache so the next operation will re-open.
            db.onclose = () => {
                cachedDBPromise = null;
            };
            db.onversionchange = () => {
                db.close();
                cachedDBPromise = null;
            };
            resolve(db);
        };
        request.onerror = () => {
            cachedDBPromise = null;
            reject(request.error);
        };
    });

    return cachedDBPromise;
};

const buildKey = (type: CacheType, cid: string, uid: string, id: string): string => `${type}:${cid}:${uid}:${id}`;

/**
 * Execute a read query ensuring the IDB request is issued synchronously
 * with transaction creation, avoiding WKWebView transaction auto-commit.
 *
 * WKWebView auto-commits transactions that have no pending IDB request between
 * microtask boundaries. The old `getStore()` pattern had an `await` gap between
 * transaction creation and the first IDB request, causing reads to silently fail
 * on cached DB connections (second+ visits).
 */
const readQuery = async <T>(fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await openDB();
    // Transaction + IDB request in the same synchronous block — no microtask gap.
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return promisifyRequest(fn(store));
};

/**
 * Execute write operations ensuring all IDB requests are issued synchronously
 * with transaction creation, avoiding WKWebView transaction auto-commit.
 */
const writeOp = async (fn: (store: IDBObjectStore) => void): Promise<void> => {
    const db = await openDB();
    // Transaction + IDB requests in the same synchronous block — no microtask gap.
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    fn(store);
    await promisifyTransaction(tx);
};

export const createIndexedDBAdapter = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider
): CacheStorage<TType> => {
    type Model = CacheModelMap[TType];
    type IndexedDbRow = CacheSchema<Model> & { meta?: CacheTtlMeta };

    const resolveMeta = (schema: IndexedDbRow): { expiresAt: number; lastSyncedAt: number } | null => {
        const fromData = schema.data.__cacheMeta;
        if (fromData) return fromData;
        return schema.meta || null;
    };

    const createSchema = (cid: string, uid: string, id: string, item: Model): IndexedDbRow => ({
        key: buildKey(type, cid, uid, id),
        type,
        cid,
        uid,
        id,
        data: withCacheMeta(type, item),
        meta: createTtlMeta(type),
    });

    return {
        async save(id: string, item: Model): Promise<Model> {
            const scope = resolveScopedContext(type, contextProvider);
            await writeOp(store => {
                store.put(createSchema(scope.cid, scope.uid, id, item));
            });
            return item;
        },

        async saveAll(items: Model[]): Promise<Model[]> {
            if (items.length === 0) return [];
            const scope = resolveScopedContext(type, contextProvider);
            await writeOp(store => {
                items.forEach(item => {
                    const id = (item as { id?: string }).id;
                    if (!id) return;
                    store.put(createSchema(scope.cid, scope.uid, id, item));
                });
            });
            return items;
        },

        async load(id: string): Promise<Model | null> {
            const scope = resolveScopedContext(type, contextProvider);
            const key = buildKey(type, scope.cid, scope.uid, id);
            const schema = await readQuery<IndexedDbRow | undefined>(store => store.get(key));
            if (!schema) return null;

            const meta = resolveMeta(schema);
            if (meta && isExpired(meta)) {
                await writeOp(store => {
                    store.delete(key);
                });
                return null;
            }
            return schema.data as Model;
        },

        async loadAll(): Promise<Model[]> {
            const scope = resolveScopedContext(type, contextProvider);
            const schemas = await readQuery<IndexedDbRow[]>(store => {
                const index = store.index(TYPE_CID_UID_INDEX);
                return index.getAll([type, scope.cid, scope.uid]);
            });

            const alive = schemas.filter(schema => {
                const meta = resolveMeta(schema);
                return !(meta && isExpired(meta));
            });
            const expiredKeys = schemas
                .filter(schema => {
                    const meta = resolveMeta(schema);
                    return !!(meta && isExpired(meta));
                })
                .map(schema => schema.key);

            if (expiredKeys.length > 0) {
                await writeOp(store => {
                    expiredKeys.forEach(key => store.delete(key));
                });
            }

            return alive.map(schema => schema.data as Model);
        },

        async delete(id: string): Promise<void> {
            const scope = resolveScopedContext(type, contextProvider);
            await writeOp(store => {
                store.delete(buildKey(type, scope.cid, scope.uid, id));
            });
        },

        async deleteAll(ids: string[]): Promise<void> {
            if (ids.length === 0) return;
            const scope = resolveScopedContext(type, contextProvider);
            await writeOp(store => {
                ids.forEach(id => store.delete(buildKey(type, scope.cid, scope.uid, id)));
            });
        },

        async clearAll(): Promise<void> {
            const scope = resolveScopedContext(type, contextProvider);
            const keys = await readQuery<IDBValidKey[]>(store => {
                const index = store.index(TYPE_CID_UID_INDEX);
                return index.getAllKeys([type, scope.cid, scope.uid]);
            });
            if (keys.length > 0) {
                await writeOp(store => {
                    keys.forEach(key => store.delete(key));
                });
            }
        },
    };
};

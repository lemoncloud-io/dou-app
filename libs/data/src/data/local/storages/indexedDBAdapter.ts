import type { CacheModelMap, CacheTtlMeta, CacheType } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories';
import type { CacheSchema, CacheStorage } from './cacheStorage';
import { type AdapterScope, createTtlMeta, isExpired, resolveScopedContext, withCacheMeta } from './utils';

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

export const createIndexedDBAdapter = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider
): CacheStorage<TType> => {
    type Model = CacheModelMap[TType];
    type Scope = AdapterScope;
    type IndexedDbRow = CacheSchema<Model> & { meta?: CacheTtlMeta };

    const getStore = async (mode: IDBTransactionMode) => {
        const db = await openDB();
        const transaction = db.transaction(STORE_NAME, mode);
        return { store: transaction.objectStore(STORE_NAME), transaction };
    };

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

    const getScopeIndexKeys = async (store: IDBObjectStore, scope: Scope): Promise<IDBValidKey[]> => {
        const index = store.index(TYPE_CID_UID_INDEX);
        return promisifyRequest<IDBValidKey[]>(index.getAllKeys([type, scope.cid, scope.uid]));
    };

    const getScopeSchemas = async (store: IDBObjectStore, scope: Scope): Promise<IndexedDbRow[]> => {
        const index = store.index(TYPE_CID_UID_INDEX);
        return promisifyRequest<IndexedDbRow[]>(index.getAll([type, scope.cid, scope.uid]));
    };

    return {
        async save(id: string, item: Model): Promise<Model> {
            const scope = resolveScopedContext(type, contextProvider);
            const { store, transaction } = await getStore('readwrite');
            store.put(createSchema(scope.cid, scope.uid, id, item));
            await promisifyTransaction(transaction);
            return item;
        },

        async saveAll(items: Model[]): Promise<Model[]> {
            if (items.length === 0) return [];
            const scope = resolveScopedContext(type, contextProvider);
            const { store, transaction } = await getStore('readwrite');

            items.forEach(item => {
                const id = (item as { id?: string }).id;
                if (!id) return;
                store.put(createSchema(scope.cid, scope.uid, id, item));
            });

            await promisifyTransaction(transaction);
            return items;
        },

        async load(id: string): Promise<Model | null> {
            const scope = resolveScopedContext(type, contextProvider);
            const key = buildKey(type, scope.cid, scope.uid, id);
            const { store } = await getStore('readonly');
            const schema = await promisifyRequest<IndexedDbRow | undefined>(store.get(key));
            const meta = schema ? resolveMeta(schema) : null;
            if (schema && meta && isExpired(meta)) {
                const writeStore = await getStore('readwrite');
                writeStore.store.delete(key);
                await promisifyTransaction(writeStore.transaction);
                return null;
            }
            return schema ? (schema.data as Model) : null;
        },

        async loadAll(): Promise<Model[]> {
            const scope = resolveScopedContext(type, contextProvider);
            const { store } = await getStore('readonly');
            const schemas = await getScopeSchemas(store, scope);

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
                const writeStore = await getStore('readwrite');
                expiredKeys.forEach(key => writeStore.store.delete(key));
                await promisifyTransaction(writeStore.transaction);
            }

            return alive.map(schema => schema.data as Model);
        },

        async delete(id: string): Promise<void> {
            const scope = resolveScopedContext(type, contextProvider);
            const { store, transaction } = await getStore('readwrite');
            store.delete(buildKey(type, scope.cid, scope.uid, id));
            await promisifyTransaction(transaction);
        },

        async deleteAll(ids: string[]): Promise<void> {
            if (ids.length === 0) return;
            const scope = resolveScopedContext(type, contextProvider);
            const { store, transaction } = await getStore('readwrite');
            ids.forEach(id => store.delete(buildKey(type, scope.cid, scope.uid, id)));
            await promisifyTransaction(transaction);
        },

        async clearAll(): Promise<void> {
            const scope = resolveScopedContext(type, contextProvider);
            const { store, transaction } = await getStore('readwrite');
            const keys = await getScopeIndexKeys(store, scope);
            keys.forEach(key => store.delete(key));
            await promisifyTransaction(transaction);
        },
    };
};

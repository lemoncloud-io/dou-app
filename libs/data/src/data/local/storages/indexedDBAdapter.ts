import type { CacheModelMap, CacheType } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories';
import type { CacheSchema, CacheStorage } from './cacheStorage';

const DB_NAME = 'ChaticWebCacheDB';
const DB_VERSION = 1;
const STORE_NAME = 'cache_store';
const TYPE_CID_INDEX = 'type_cid';

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

const openDB = async (): Promise<IDBDatabase> => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            store.createIndex(TYPE_CID_INDEX, ['type', 'cid'], { unique: false });
        }
    };
    return promisifyRequest(request);
};

const getScopeCid = (contextProvider: DataContextProvider): string => {
    return contextProvider.getContext().cid || 'default';
};

const buildKey = (type: CacheType, cid: string, id: string): string => `${type}:${cid}:${id}`;

export const createIndexedDBAdapter = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider
): CacheStorage<TType> => {
    type Model = CacheModelMap[TType];

    const getStore = async (mode: IDBTransactionMode) => {
        const db = await openDB();
        const transaction = db.transaction(STORE_NAME, mode);
        return { store: transaction.objectStore(STORE_NAME), transaction };
    };

    const createSchema = (cid: string, id: string, item: Model): CacheSchema<Model> => ({
        key: buildKey(type, cid, id),
        type,
        cid,
        id,
        data: item,
    });

    return {
        async save(id: string, item: Model): Promise<Model> {
            const cid = getScopeCid(contextProvider);
            const { store, transaction } = await getStore('readwrite');
            store.put(createSchema(cid, id, item));
            await promisifyTransaction(transaction);
            return item;
        },

        async saveAll(items: Model[]): Promise<Model[]> {
            if (items.length === 0) return [];
            const cid = getScopeCid(contextProvider);
            const { store, transaction } = await getStore('readwrite');

            items.forEach(item => {
                const id = (item as { id?: string }).id;
                if (!id) return;
                store.put(createSchema(cid, id, item));
            });

            await promisifyTransaction(transaction);
            return items;
        },

        async replaceAll(items: Model[]): Promise<Model[]> {
            const cid = getScopeCid(contextProvider);
            const { store, transaction } = await getStore('readwrite');
            const index = store.index(TYPE_CID_INDEX);
            const keys = await promisifyRequest<IDBValidKey[]>(index.getAllKeys([type, cid]));

            keys.forEach(key => store.delete(key));
            items.forEach(item => {
                const id = (item as { id?: string }).id;
                if (!id) return;
                store.put(createSchema(cid, id, item));
            });

            await promisifyTransaction(transaction);
            return items;
        },

        async load(id: string): Promise<Model | null> {
            const cid = getScopeCid(contextProvider);
            const { store } = await getStore('readonly');
            const schema = await promisifyRequest<CacheSchema<Model> | undefined>(store.get(buildKey(type, cid, id)));
            return schema ? schema.data : null;
        },

        async loadAll(): Promise<Model[]> {
            const cid = getScopeCid(contextProvider);
            const { store } = await getStore('readonly');
            const index = store.index(TYPE_CID_INDEX);
            const schemas = await promisifyRequest<CacheSchema<Model>[]>(index.getAll([type, cid]));
            return schemas.map(schema => schema.data);
        },

        async delete(id: string): Promise<void> {
            const cid = getScopeCid(contextProvider);
            const { store, transaction } = await getStore('readwrite');
            store.delete(buildKey(type, cid, id));
            await promisifyTransaction(transaction);
        },

        async deleteAll(ids: string[]): Promise<void> {
            if (ids.length === 0) return;
            const cid = getScopeCid(contextProvider);
            const { store, transaction } = await getStore('readwrite');
            ids.forEach(id => store.delete(buildKey(type, cid, id)));
            await promisifyTransaction(transaction);
        },

        async clearAll(): Promise<void> {
            const cid = getScopeCid(contextProvider);
            const { store, transaction } = await getStore('readwrite');
            const index = store.index(TYPE_CID_INDEX);
            const keys = await promisifyRequest<IDBValidKey[]>(index.getAllKeys([type, cid]));
            keys.forEach(key => store.delete(key));
            await promisifyTransaction(transaction);
        },
    };
};

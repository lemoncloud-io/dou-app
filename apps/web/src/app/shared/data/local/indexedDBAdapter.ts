// apps/web/src/app/shared/data/local/indexedDBAdapter.ts
import type { CacheType } from '@chatic/app-messages';
import type { CacheStorage, CacheSchema } from './cacheStorage';

const DB_NAME = 'ChaticWebCacheDB';
const DB_VERSION = 1;
const STORE_NAME = 'cache_store';

/**
 * IDBRequest를 Promise로 변환하는 헬퍼 함수
 */
const promisifyRequest = <T>(request: IDBRequest<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

/**
 * IDBTransaction의 완료 여부를 Promise로 변환하는 헬퍼 함수
 */
const promisifyTransaction = (transaction: IDBTransaction): Promise<void> => {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(new Error('Transaction aborted'));
    });
};

const openDB = (): Promise<IDBDatabase> => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            store.createIndex('type_cid', ['type', 'cid'], { unique: false });
        }
    };
    return promisifyRequest(request);
};

export const createIndexedDBAdapter = <T extends { id?: string }>(type: CacheType, cid: string): CacheStorage<T> => {
    const generateKey = (id: string) => `${type}:${cid}:${id}`;

    const getStore = async (mode: IDBTransactionMode) => {
        const db = await openDB();
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        return { store, transaction };
    };

    return {
        async save(id: string, item: T): Promise<void> {
            const { store } = await getStore('readwrite');
            const data: CacheSchema<T> = { key: generateKey(id), type, cid, id, data: item };
            await promisifyRequest(store.put(data));
        },

        async saveAll(items: T[]): Promise<void> {
            const { store, transaction } = await getStore('readwrite');

            items.forEach(item => {
                const itemId = item.id;
                if (!itemId) return;
                const data: CacheSchema<T> = { key: generateKey(itemId), type, cid, id: itemId, data: item };
                store.put(data); // 비동기 대기 없이 큐에 삽입
            });

            return promisifyTransaction(transaction); // 트랜잭션 전체 완료 대기
        },

        async load(id: string): Promise<T | null> {
            const { store } = await getStore('readonly');
            const result = await promisifyRequest<CacheSchema<T>>(store.get(generateKey(id)));
            return result ? result.data : null;
        },

        async loadAll(): Promise<T[]> {
            const { store } = await getStore('readonly');
            const index = store.index('type_cid');
            const results = await promisifyRequest<CacheSchema<T>[]>(index.getAll([type, cid]));
            return results.map(r => r.data);
        },

        async delete(id: string): Promise<void> {
            const { store } = await getStore('readwrite');
            await promisifyRequest(store.delete(generateKey(id)));
        },

        async deleteAll(ids: string[]): Promise<void> {
            const { store, transaction } = await getStore('readwrite');

            ids.forEach(id => {
                store.delete(generateKey(id)); // 큐에 삭제 작업 삽입
            });

            return promisifyTransaction(transaction); // 트랜잭션 원자적 완료
        },
    };
};

import type { CacheType } from '@chatic/app-messages';
import type { CursorQueryOptions, IIndexedDB, IndexedDbRow } from './types';

const DB_NAME = 'ChaticWebCacheDB';
const DB_VERSION = 3;
const STORE_NAME = 'cache_store';
export const TYPE_CID_UID_INDEX = 'type_cid_uid';
export const CHAT_PAGINATION_INDEX = 'chat_pagination_index';

/**
 * `chat_no`가 이 값이면 서버 번호가 아직 없는 행입니다 — 전송 중이거나 실패한 메시지.
 * `ChatLocalDataSourceV2`가 낙관적 전송에 이 값을 쓰고, `mappers.ts`가 서버 `chatNo` 없는 응답을
 * 여기로 강등합니다.
 *
 * `CHAT_PAGINATION_INDEX`의 마지막 키 요소라서 **정렬상 최하위**이고, 그 사실이 두 곳의 동작을
 * 지배합니다: 최신순 페이지 읽기는 이 행들을 놓치고(`ChatQueryExecutor.includeUnsent`),
 * eviction은 이 행들을 건드리면 안 됩니다(`IndexedDBAdapter`). 상수가 한 곳에 있어야
 * 그 둘이 같은 사실을 말하고 있다는 게 보입니다.
 */
export const UNSENT_CHAT_NO = 0;

/**
 * IndexedDB 데이터베이스와 물리적으로 상호작용하는 구체적인 구현체입니다.
 */
export class IndexedDBDatabase implements IIndexedDB {
    private dbPromise: Promise<IDBDatabase>;

    constructor() {
        this.dbPromise = this.openDB();
    }

    private openDB(): Promise<IDBDatabase> {
        return new Promise<IDBDatabase>((resolve, reject) => {
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
                if (!store.indexNames.contains(CHAT_PAGINATION_INDEX)) {
                    store.createIndex(CHAT_PAGINATION_INDEX, ['type', 'cid', 'uid', 'channel_id', 'chat_no'], {
                        unique: false,
                    });
                }
            };

            request.onsuccess = () => {
                const db = request.result;
                db.onclose = () => {
                    this.dbPromise = this.openDB();
                };
                db.onversionchange = () => {
                    db.close();
                    this.dbPromise = this.openDB();
                };
                resolve(db);
            };

            request.onerror = () => reject(request.error);
        });
    }

    private async getDB(): Promise<IDBDatabase> {
        return this.dbPromise;
    }

    private promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    private promisifyTransaction(transaction: IDBTransaction): Promise<void> {
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(new Error('Transaction aborted'));
        });
    }

    private async readOperation<T>(fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
        const db = await this.getDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        return this.promisifyRequest(fn(store));
    }

    private async writeOperation(fn: (store: IDBObjectStore) => void): Promise<void> {
        const db = await this.getDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        fn(store);
        await this.promisifyTransaction(tx);
    }

    async save<TType extends CacheType>(item: IndexedDbRow<TType>): Promise<void> {
        await this.writeOperation(store => {
            store.put(item);
        });
    }

    async saveAll<TType extends CacheType>(items: IndexedDbRow<TType>[]): Promise<void> {
        if (items.length === 0) return;
        await this.writeOperation(store => {
            items.forEach(item => store.put(item));
        });
    }

    async load<TType extends CacheType>(key: string): Promise<IndexedDbRow<TType> | undefined> {
        return this.readOperation<IndexedDbRow<TType> | undefined>(store => store.get(key));
    }

    async loadAll<TType extends CacheType>(
        indexName: string,
        key: IDBValidKey | IDBKeyRange
    ): Promise<IndexedDbRow<TType>[]> {
        return this.readOperation<IndexedDbRow<TType>[]>(store => {
            const index = store.index(indexName);
            return index.getAll(key);
        });
    }

    async loadWithCursor<TType extends CacheType>(options: CursorQueryOptions<TType>): Promise<IndexedDbRow<TType>[]> {
        const db = await this.getDB();
        return new Promise<IndexedDbRow<TType>[]>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const index = store.index(options.indexName);
            const request = index.openCursor(options.range, options.direction);
            const results: IndexedDbRow<TType>[] = [];

            request.onsuccess = event => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    const item = cursor.value as IndexedDbRow<TType>;
                    if (options.filter(item)) {
                        results.push(item);
                    }
                    if (results.length >= options.limit) {
                        resolve(results);
                        return;
                    }
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async delete(key: string): Promise<void> {
        await this.writeOperation(store => {
            store.delete(key);
        });
    }

    async deleteAll(keys: string[]): Promise<void> {
        if (keys.length === 0) return;
        await this.writeOperation(store => {
            keys.forEach(key => store.delete(key));
        });
    }

    async clearAll(indexName: string, key: IDBValidKey): Promise<void> {
        const keysToDelete = await this.readOperation<IDBValidKey[]>(store => {
            const index = store.index(indexName);
            return index.getAllKeys(key);
        });
        if (keysToDelete.length > 0) {
            await this.deleteAll(keysToDelete as string[]);
        }
    }

    async findNewestKeyBeyond(indexName: string, range: IDBKeyRange, skip: number): Promise<IDBValidKey | null> {
        const db = await this.getDB();
        return new Promise<IDBValidKey | null>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).index(indexName).openKeyCursor(range, 'prev');
            let advanced = false;

            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) {
                    resolve(null);
                    return;
                }
                if (!advanced && skip > 0) {
                    advanced = true;
                    cursor.advance(skip);
                    return;
                }
                resolve(cursor.key);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async clearByRange(indexName: string, range: IDBKeyRange): Promise<void> {
        const keysToDelete = await this.readOperation<IDBValidKey[]>(store => {
            const index = store.index(indexName);
            return index.getAllKeys(range);
        });
        if (keysToDelete.length > 0) {
            await this.deleteAll(keysToDelete as string[]);
        }
    }
}

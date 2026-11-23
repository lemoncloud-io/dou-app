import type { CacheType } from '@chatic/bridge-messages';
import { logger } from '@chatic/bridges';
import type {
    CursorQueryOptions,
    IIndexedDB,
    IndexedDbChatMediaFill,
    IndexedDbRow,
    IndexedDbWriteBatch,
} from '@chatic/data';

const DB_NAME = 'ChaticWebCacheDB';
const DB_VERSION = 4;
const STORE_NAME = 'cache_store';
export const TYPE_CID_UID_INDEX = 'type_cid_uid';
export const CHAT_PAGINATION_INDEX = 'chat_pagination_index';
export const CHAT_MEDIA_INDEX = 'chat_media_index';

export const UNSENT_CHAT_NO = 0;

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

                logger.info('CACHE', `web cache schema upgrade v${event.oldVersion} → v${event.newVersion}`, {
                    data: { from: event.oldVersion, to: event.newVersion },
                });

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
                if (!store.indexNames.contains(CHAT_MEDIA_INDEX)) {
                    store.createIndex(CHAT_MEDIA_INDEX, ['type', 'cid', 'uid', 'channel_id', 'kind', 'chat_no'], {
                        unique: false,
                    });
                }
            };

            request.onsuccess = () => {
                const db = request.result;
                db.onclose = () => {
                    logger.warn('CACHE', 'web cache closed unexpectedly — reopening');
                    this.dbPromise = this.openDB();
                };
                db.onversionchange = () => {
                    logger.warn('CACHE', 'web cache version changed in another tab — reopening');
                    db.close();
                    this.dbPromise = this.openDB();
                };
                resolve(db);
            };

            request.onerror = () => {
                logger.error('CACHE', 'web cache failed to open', { error: request.error });
                reject(request.error);
            };
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

    async writeBatch(batch: IndexedDbWriteBatch): Promise<void> {
        const db = await this.getDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const done = this.promisifyTransaction(tx);
        try {
            const store = tx.objectStore(STORE_NAME);
            batch.deleteKeys?.forEach(key => store.delete(key));
            batch.deleteRanges?.forEach(range => store.delete(range));
            batch.put?.forEach(record => store.put(record));
        } catch (error) {
            done.catch(() => undefined);
            tx.abort();
            throw error;
        }
        await done;
    }

    async walkIndex<T>(
        indexName: string,
        range: IDBKeyRange,
        direction: IDBCursorDirection,
        visit: (record: T) => boolean
    ): Promise<void> {
        const db = await this.getDB();
        return new Promise<void>((resolve, reject) => {
            const request = db
                .transaction(STORE_NAME, 'readonly')
                .objectStore(STORE_NAME)
                .index(indexName)
                .openCursor(range, direction);
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor || !visit(cursor.value as T)) {
                    resolve();
                    return;
                }
                cursor.continue();
            };
            request.onerror = () => reject(request.error);
        });
    }

    async applyChatMediaFill(fills: IndexedDbChatMediaFill[], version: number): Promise<number> {
        if (fills.length === 0) return 0;
        const db = await this.getDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const done = this.promisifyTransaction(tx);
        const store = tx.objectStore(STORE_NAME);
        let applied = 0;
        for (const fill of fills) {
            const read = store.get(fill.chatKey);
            read.onsuccess = () => {
                const row = read.result as IndexedDbRow<'chat'> | undefined;
                const rowVersion =
                    (row?.data as { mediaEntriesVersion?: number } | undefined)?.mediaEntriesVersion ?? 0;
                if (!row || rowVersion >= version) return;
                store.delete(fill.entriesRange);
                for (const entry of fill.entries) {
                    store.put({ ...entry, channel_id: row.channel_id ?? '', chat_no: row.chat_no ?? 0 });
                }
                applied += 1;
            };
        }
        await done;
        return applied;
    }

    async count(indexName: string, range: IDBKeyRange): Promise<number> {
        return this.readOperation<number>(store => store.index(indexName).count(range));
    }

    async clearByRange(indexName: string, range: IDBKeyRange): Promise<number> {
        const keysToDelete = await this.readOperation<IDBValidKey[]>(store => {
            const index = store.index(indexName);
            return index.getAllKeys(range);
        });
        if (keysToDelete.length > 0) {
            await this.deleteAll(keysToDelete as string[]);
        }
        return keysToDelete.length;
    }
}

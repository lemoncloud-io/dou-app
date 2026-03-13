import type { StorageAdapter } from './StorageAdapter';

const DB_NAME = 'chatic-db';
const VERSION = 1;
const STORES = ['chat', 'user', 'channel', 'chats', 'users', 'channels'];

const getDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, VERSION);

        request.onupgradeneeded = event => {
            const db = (event.target as IDBOpenDBRequest).result;
            STORES.forEach(storeName => {
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName, { keyPath: 'id' });
                }
            });
        };

        request.onsuccess = event => {
            resolve((event.target as IDBOpenDBRequest).result);
        };

        request.onerror = event => {
            reject((event.target as IDBOpenDBRequest).error);
        };
    });
};

export const createIndexedDBAdapter = <T extends { id?: string }>(tableName: string): StorageAdapter<T> => {
    return {
        save: async (id: string, item: T): Promise<void> => {
            const db = await getDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([tableName], 'readwrite');
                const store = transaction.objectStore(tableName);
                // id가 item 내부에 포함되어 있어야 keyPath 'id'가 동작함
                // 만약 item에 id가 없다면 put(item, id) 형태여야 하는데,
                // createObjectStore에서 keyPath: 'id'를 설정했으므로 item.id가 필수임.
                // 편의상 item에 id를 덮어씌움
                const dataToSave = { ...item, id };

                const request = store.put(dataToSave);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },

        saveAll: async (items: T[]): Promise<void> => {
            const db = await getDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([tableName], 'readwrite');
                const store = transaction.objectStore(tableName);

                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);

                items.forEach(item => {
                    store.put(item);
                });
            });
        },

        load: async (id: string): Promise<T | null> => {
            const db = await getDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([tableName], 'readonly');
                const store = transaction.objectStore(tableName);
                const request = store.get(id);

                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
            });
        },

        loadAll: async (query?: any): Promise<T[]> => {
            const db = await getDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([tableName], 'readonly');
                const store = transaction.objectStore(tableName);
                const request = store.getAll();

                request.onsuccess = () => {
                    let results = request.result as T[];

                    // 간단한 인메모리 필터링 (query 객체 활용)
                    if (query) {
                        results = results.filter(item => {
                            for (const key in query) {
                                if ((item as any)[key] !== query[key]) {
                                    return false;
                                }
                            }
                            return true;
                        });
                    }
                    resolve(results);
                };
                request.onerror = () => reject(request.error);
            });
        },

        delete: async (id: string): Promise<void> => {
            const db = await getDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([tableName], 'readwrite');
                const store = transaction.objectStore(tableName);
                const request = store.delete(id);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },

        deleteAll: async (ids: string[]): Promise<void> => {
            const db = await getDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([tableName], 'readwrite');
                const store = transaction.objectStore(tableName);

                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);

                ids.forEach(id => {
                    store.delete(id);
                });
            });
        },
    };
};

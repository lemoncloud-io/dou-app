import type { CacheType } from '@chatic/app-messages';
import type { CacheStorage, CacheSchema } from './cacheStorage';

// IndexedDB 설정 상수
const DB_NAME = 'ChaticWebCacheDB';
const DB_VERSION = 1;
const STORE_NAME = 'cache_store';

/**
 * IDBRequest를 Promise로 변환하는 헬퍼 함수
 * IndexedDB의 이벤트 기반 API를 async/await 패턴으로 사용할 수 있게 합니다.
 */
const promisifyRequest = <T>(request: IDBRequest<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

/**
 * IDBTransaction의 완료 여부를 Promise로 변환하는 헬퍼 함수
 * 트랜잭션 내의 모든 작업이 성공적으로 커밋되었는지 확인합니다.
 */
const promisifyTransaction = (transaction: IDBTransaction): Promise<void> => {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(new Error('Transaction aborted'));
    });
};

/**
 * 데이터베이스를 열고 필요한 경우 스키마를 생성/업데이트합니다.
 */
const openDB = (): Promise<IDBDatabase> => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // DB 버전이 올라가거나 처음 생성될 때 실행되는 스키마 정의 로직
    request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            // 'key'를 기본키로 사용하는 오브젝트 스토어 생성
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            // 도메인별 일괄 조회를 위해 'type'과 'cid'를 묶은 복합 인덱스 생성
            store.createIndex('type_cid', ['type', 'cid'], { unique: false });
        }
    };
    return promisifyRequest(request);
};

/**
 * 웹 환경을 위한 CacheStorage의 IndexedDB 구현체입니다.
 * [type + cid] 복합 인덱스를 사용하여 단일 오브젝트 스토어 내에서 데이터를 관리합니다.
 */
export const createIndexedDBAdapter = <T extends { id?: string }>(type: CacheType, cid: string): CacheStorage<T> => {
    // 저장소 내에서 고유성을 보장하기 위한 복합 키 생성 함수
    const generateKey = (id: string) => `${type}:${cid}:${id}`;

    /**
     * 지정된 모드(readonly/readwrite)로 스토어와 트랜잭션을 가져옵니다.
     */
    const getStore = async (mode: IDBTransactionMode) => {
        const db = await openDB();
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        return { store, transaction };
    };

    return {
        /**
         * 단일 아이템을 저장하거나 업데이트합니다.
         */
        async save(id: string, item: T): Promise<void> {
            const { store, transaction } = await getStore('readwrite');
            const data: CacheSchema<T> = { key: generateKey(id), type, cid, id, data: item };
            store.put(data);
            await promisifyTransaction(transaction);
        },

        /**
         * 여러 아이템을 하나의 트랜잭션 내에서 원자적으로 저장합니다.
         */
        async saveAll(items: T[]): Promise<void> {
            const { store, transaction } = await getStore('readwrite');

            items.forEach(item => {
                const itemId = item.id;
                if (!itemId) return;
                const data: CacheSchema<T> = { key: generateKey(itemId), type, cid, id: itemId, data: item };
                store.put(data); // 루프 내에서는 개별 Promise를 기다리지 않고 큐에 삽입
            });

            // 모든 작업이 포함된 트랜잭션이 최종 완료될 때까지 대기
            return promisifyTransaction(transaction);
        },

        /**
         * 기존 데이터를 모두 삭제하고 새 데이터로 교체합니다. (단일 트랜잭션)
         * 서버 응답으로 전체 동기화 시 stale 데이터를 원자적으로 제거합니다.
         */
        async replaceAll(items: T[]): Promise<void> {
            const { store, transaction } = await getStore('readwrite');
            const index = store.index('type_cid');
            const existingKeys = await promisifyRequest<IDBValidKey[]>(index.getAllKeys([type, cid]));

            existingKeys.forEach(key => store.delete(key));

            items.forEach(item => {
                const itemId = item.id;
                if (!itemId) return;
                const data: CacheSchema<T> = { key: generateKey(itemId), type, cid, id: itemId, data: item };
                store.put(data);
            });

            return promisifyTransaction(transaction);
        },

        /**
         * ID를 통해 단일 데이터를 로드합니다.
         */
        async load(id: string): Promise<T | null> {
            const { store } = await getStore('readonly');
            const result = await promisifyRequest<CacheSchema<T>>(store.get(generateKey(id)));
            return result ? result.data : null;
        },

        /**
         * 인덱스를 사용하여 특정 도메인(type, cid)에 속한 모든 데이터를 배열로 반환합니다.
         */
        async loadAll(): Promise<T[]> {
            const { store } = await getStore('readonly');
            const index = store.index('type_cid');
            // 복합 인덱스 검색을 통해 관련 데이터만 효율적으로 조회
            const results = await promisifyRequest<CacheSchema<T>[]>(index.getAll([type, cid]));
            return results.map(r => r.data);
        },

        /**
         * ID를 통해 단일 데이터를 삭제합니다.
         */
        async delete(id: string): Promise<void> {
            const { store, transaction } = await getStore('readwrite');
            store.delete(generateKey(id));
            await promisifyTransaction(transaction);
        },

        /**
         * 여러 ID를 하나의 트랜잭션 내에서 일괄 삭제합니다.
         */
        async deleteAll(ids: string[]): Promise<void> {
            const { store, transaction } = await getStore('readwrite');

            ids.forEach(id => {
                store.delete(generateKey(id));
            });

            return promisifyTransaction(transaction);
        },
    };
};

import type { IWebBridgeClient } from '@chatic/bridges';
import type { CacheType } from '@chatic/app-messages';
import {
    type CacheStorage,
    type DataContextProvider,
    type CacheReadPolicy,
    IndexedDBDatabase,
    IndexedDBAdapter,
    NativeDBAdapter,
    ChatQueryExecutor,
    DynamicCacheStorage,
} from '@chatic/data';

/**
 * 환경별 저장소 조합을 캡슐화하는 전략 인터페이스
 */
export interface CacheStorageStrategy {
    create<TType extends CacheType>(type: TType, contextProvider: DataContextProvider): CacheStorage<TType>;
}

// ─── 공유 IndexedDB 인스턴스 ─────────────────────────────────────────

let sharedDatabase: IndexedDBDatabase | null = null;
const getSharedDatabase = (): IndexedDBDatabase => {
    if (!sharedDatabase) {
        sharedDatabase = new IndexedDBDatabase();
    }
    return sharedDatabase;
};

// ─── 헬퍼: IndexedDBAdapter 생성 ────────────────────────────────────

const createIndexedDBAdapter = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider
): IndexedDBAdapter<TType> => {
    const db = getSharedDatabase();
    if (type === 'chat') {
        return new IndexedDBAdapter(
            db,
            'chat',
            contextProvider,
            new ChatQueryExecutor()
        ) as unknown as IndexedDBAdapter<TType>;
    }
    return new IndexedDBAdapter(db, type, contextProvider);
};

// ─── 타입별 기본 Policy ──────────────────────────────────────────────

const defaultPolicies: Record<CacheType, { readPolicy: CacheReadPolicy; loadAllPolicy: CacheReadPolicy }> = {
    chat: { readPolicy: 'hot-first', loadAllPolicy: 'hot-first' },
    channel: { readPolicy: 'hot-first', loadAllPolicy: 'hot-first' },
    invitecloud: { readPolicy: 'hot-first', loadAllPolicy: 'hot-first' },
    join: { readPolicy: 'hot-first', loadAllPolicy: 'hot-first' },
    site: { readPolicy: 'hot-first', loadAllPolicy: 'hot-first' },
    user: { readPolicy: 'hot-first', loadAllPolicy: 'hot-first' },
};

// ─── Strategy 구현체 ─────────────────────────────────────────────────

/**
 * 브라우저 환경용: IndexedDBAdapter 단독 사용
 */
export class IndexedDbOnlyCacheStorageStrategy implements CacheStorageStrategy {
    create<TType extends CacheType>(type: TType, contextProvider: DataContextProvider): CacheStorage<TType> {
        return createIndexedDBAdapter(type, contextProvider);
    }
}

/**
 * Fallback/테스트용: NativeDBAdapter 단독 사용
 */
export class NativeDbOnlyCacheStorageStrategy implements CacheStorageStrategy {
    constructor(private readonly bridge: IWebBridgeClient) {}

    create<TType extends CacheType>(type: TType, contextProvider: DataContextProvider): CacheStorage<TType> {
        return new NativeDBAdapter(this.bridge, type, contextProvider);
    }
}

/**
 * 앱 WebView용: Hot(IndexedDB) + Cold(NativeDB) 2-Tier 캐시
 */
export class HotColdCacheStorageStrategy implements CacheStorageStrategy {
    constructor(private readonly bridge: IWebBridgeClient) {}

    create<TType extends CacheType>(type: TType, contextProvider: DataContextProvider): CacheStorage<TType> {
        const hot = createIndexedDBAdapter(type, contextProvider);
        const cold = new NativeDBAdapter(this.bridge, type, contextProvider);
        const policies = defaultPolicies[type];

        return new DynamicCacheStorage<TType>(hot, cold, {
            type,
            readPolicy: policies.readPolicy,
            loadAllPolicy: policies.loadAllPolicy,
            onHotError: (error: unknown, context: { type?: TType; operation: string }) => {
                console.warn('[DynamicCacheStorage] Hot error:', context.operation, error);
            },
        });
    }
}

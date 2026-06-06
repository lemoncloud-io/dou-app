import type { IWebBridgeClient } from '@chatic/bridges';
import type { CacheType } from '@chatic/app-messages';
import {
    type CacheStorage,
    type DataContextProvider,
    type PolicyResolver,
    type CacheReadPolicy,
    type EvictionStrategy,
    type CapacityPolicy,
    type CacheErrorReporter,
    IndexedDBDatabase,
    IndexedDBAdapter,
    NativeDBAdapter,
    ChatQueryExecutor,
    DynamicCacheStorage,
    DefaultPolicyResolver,
    DefaultEvictionStrategy,
    DefaultCapacityPolicy,
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

// ─── 기본 Reporter ──────────────────────────────────────────────────

const defaultReporter: CacheErrorReporter = (error, context) => {
    console.warn(`[DynamicCacheStorage] ${context.tier} error:`, context.operation, error);
};

// ─── AppPolicyResolver ──────────────────────────────────────────────

const appReadPolicies: Record<CacheType, CacheReadPolicy> = {
    chat: 'hot-first',
    channel: 'hot-first',
    invitecloud: 'hot-first',
    join: 'cold-first',
    site: 'hot-first',
    user: 'hot-first',
};

const appLoadAllPolicies: Record<CacheType, CacheReadPolicy> = {
    chat: 'hot-first',
    channel: 'hot-first',
    invitecloud: 'hot-first',
    join: 'cold-first',
    site: 'hot-first',
    user: 'hot-first',
};

/**
 * 앱 환경용 PolicyResolver.
 * - channel, site, user, chat, invitecloud → hot-first (IndexedDB 우선, bridge 비용 절감)
 * - join → cold-first (readNo 변경 빈번, Cold 정합성 우선)
 */
export class AppPolicyResolver implements PolicyResolver {
    resolveReadPolicy(type: CacheType): CacheReadPolicy {
        return appReadPolicies[type] ?? 'hot-first';
    }
    resolveLoadAllPolicy(type: CacheType): CacheReadPolicy {
        return appLoadAllPolicies[type] ?? 'hot-first';
    }
}

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

export interface HotColdStrategyOptions {
    policyResolver?: PolicyResolver;
    evictionStrategy?: EvictionStrategy;
    capacityPolicy?: CapacityPolicy;
    reporter?: CacheErrorReporter;
}

/**
 * 앱 WebView용: Hot(IndexedDB) + Cold(NativeDB) 2-Tier 캐시
 */
export class HotColdCacheStorageStrategy implements CacheStorageStrategy {
    private readonly policyResolver: PolicyResolver;
    private readonly evictionStrategy: EvictionStrategy;
    private readonly capacityPolicy: CapacityPolicy;
    private readonly reporter: CacheErrorReporter;

    constructor(
        private readonly bridge: IWebBridgeClient,
        options?: HotColdStrategyOptions
    ) {
        this.policyResolver = options?.policyResolver ?? new DefaultPolicyResolver();
        this.evictionStrategy = options?.evictionStrategy ?? new DefaultEvictionStrategy();
        this.capacityPolicy = options?.capacityPolicy ?? new DefaultCapacityPolicy();
        this.reporter = options?.reporter ?? defaultReporter;
    }

    create<TType extends CacheType>(type: TType, contextProvider: DataContextProvider): CacheStorage<TType> {
        const hot = createIndexedDBAdapter(type, contextProvider);
        const cold = new NativeDBAdapter(this.bridge, type, contextProvider);

        const dcs = new DynamicCacheStorage<TType>(hot, cold, {
            type,
            policyResolver: this.policyResolver,
            evictionStrategy: this.evictionStrategy,
            capacityPolicy: this.capacityPolicy,
            reporter: this.reporter,
        });

        // onStartup: fire-and-forget (앱 시작 지연 방지)
        this.evictionStrategy.onStartup(hot).catch(startupErr => {
            try {
                this.reporter(startupErr, { tier: 'eviction', operation: 'eviction', type });
            } catch {
                // reporter 오류 무시
            }
        });

        return dcs;
    }
}

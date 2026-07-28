import type { IWebBridgeClient } from '@chatic/bridges';
import type { CacheType } from '@chatic/app-messages';
import {
    type CacheErrorReporter,
    type CacheReadPolicy,
    type CacheStorage,
    type CapacityPolicy,
    ChatQueryExecutor,
    type DataContextProvider,
    DefaultCapacityPolicy,
    DefaultEvictionStrategy,
    DefaultPolicyResolver,
    DynamicCacheStorage,
    type EvictionStrategy,
    IndexedDBAdapter,
    IndexedDBDatabase,
    NativeDBAdapter,
    type PolicyResolver,
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
    contextProvider: DataContextProvider,
    maxChatsPerChannel?: number
): IndexedDBAdapter<TType> => {
    const db = getSharedDatabase();
    if (type === 'chat') {
        return new IndexedDBAdapter(db, 'chat', contextProvider, {
            executor: new ChatQueryExecutor(),
            maxChatsPerChannel,
        }) as unknown as IndexedDBAdapter<TType>;
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
    profile: 'hot-first',
    meta: 'hot-first',
};

const appLoadAllPolicies: Record<CacheType, CacheReadPolicy> = {
    chat: 'hot-first',
    channel: 'hot-first',
    invitecloud: 'hot-first',
    join: 'cold-first',
    site: 'hot-first',
    user: 'hot-first',
    profile: 'hot-first',
    meta: 'hot-first',
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
 * 브라우저 환경용: IndexedDBAdapter 단독 사용.
 *
 * 채널당 메시지 상한은 **주입받는다**. 이 경로는 `DynamicCacheStorage`를 안 거쳐 eviction 훅이
 * 없으므로(= 무제한 증가) 상한이 필요한 건 맞지만, **이 전략은 데스크탑 전용이 아니다** —
 * `localFactory.selectStrategy`가 `window.ReactNativeWebView`가 없는 **모든** 클라이언트를 여기로
 * 보낸다. 즉 평범한 브라우저로 연 `apps/web`과 `apps/admin-v2`도 이 전략을 쓴다.
 * 상한을 모듈 상수로 박으면 그 클라이언트들의 스크롤백까지 조용히 잘라낸다.
 * 미지정 = 무제한(기존 동작), 즉 정책을 가진 앱만 값을 넣는다.
 */
export class IndexedDbOnlyCacheStorageStrategy implements CacheStorageStrategy {
    constructor(private readonly maxChatsPerChannel?: number) {}

    create<TType extends CacheType>(type: TType, contextProvider: DataContextProvider): CacheStorage<TType> {
        return createIndexedDBAdapter(type, contextProvider, this.maxChatsPerChannel);
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

import type { IWebBridgeClient } from '@chatic/bridges';
import type { CacheType } from '@chatic/app-messages';
import {
    type CacheStorage,
    ChatQueryExecutor,
    type DataContextProvider,
    type IGlobalCacheSearchSource,
    IndexedDBAdapter,
    IndexedDBDatabase,
    IndexedDbGlobalSearchSource,
    NativeDBAdapter,
    NativeGlobalSearchSource,
} from '@chatic/data';

/**
 * 환경별 저장소 조합을 캡슐화하는 전략 인터페이스
 */
export interface CacheStorageStrategy {
    create<TType extends CacheType>(type: TType, contextProvider: DataContextProvider): CacheStorage<TType>;

    /**
     * 클라우드(cid) 불문 전역 캐시 검색 소스를 생성합니다. 환경별로 구현체는 다르지만
     * (IndexedDB 범위 스캔 vs 네이티브 브리지) 기대 동작은 동일해야 합니다(ADR-0033).
     */
    createGlobalSearchSource(): IGlobalCacheSearchSource;
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

/**
 * Builds a hot(IndexedDB) reader for the invitecloud slot, bypassing the active
 * CacheStorageStrategy. The boot migration uses it to reach invited clouds that an earlier 2-tier
 * build persisted to hot IndexedDB, before native switched to cold(NativeDB)-only storage — the
 * cold-only strategy can no longer see those hot rows on its own.
 *
 * invitecloud is globally scoped (resolveScopedContext forces cid/uid='global'), so the reader
 * needs no live DataContext; the stub provider only satisfies the adapter constructor.
 */
export const createHotInviteCloudStorage = (): CacheStorage<'invitecloud'> => {
    const stubProvider: DataContextProvider = {
        getContext: () => ({ cid: 'global' }),
        setContext: () => undefined,
    };
    return createIndexedDBAdapter('invitecloud', stubProvider);
};

// ─── Strategy 구현체 ─────────────────────────────────────────────────

/**
 * 브라우저 환경용: IndexedDBAdapter 단독 사용.
 *
 * 채널당 메시지 상한은 **주입받는다**. 이 경로는 eviction 훅이 없으므로(= 무제한 증가) 상한이
 * 필요한 건 맞지만, **이 전략은 데스크탑 전용이 아니다** — `localFactory.selectStrategy`가
 * `window.ReactNativeWebView`가 없는 **모든** 클라이언트를 여기로 보낸다. 즉 평범한 브라우저로
 * 연 `apps/web`과 `apps/admin-v2`도 이 전략을 쓴다.
 * 상한을 모듈 상수로 박으면 그 클라이언트들의 스크롤백까지 조용히 잘라낸다.
 * 미지정 = 무제한(기존 동작), 즉 정책을 가진 앱만 값을 넣는다.
 */
export class IndexedDbOnlyCacheStorageStrategy implements CacheStorageStrategy {
    constructor(private readonly maxChatsPerChannel?: number) {}

    create<TType extends CacheType>(type: TType, contextProvider: DataContextProvider): CacheStorage<TType> {
        return createIndexedDBAdapter(type, contextProvider, this.maxChatsPerChannel);
    }

    createGlobalSearchSource(): IGlobalCacheSearchSource {
        return new IndexedDbGlobalSearchSource(getSharedDatabase());
    }
}

/**
 * 앱 WebView용: NativeDBAdapter(SQLite) 단독 사용 — WebView IndexedDB 축출에도 살아남는
 * 단일 내구 저장소.
 */
export class NativeDbOnlyCacheStorageStrategy implements CacheStorageStrategy {
    constructor(private readonly bridge: IWebBridgeClient) {}

    create<TType extends CacheType>(type: TType, contextProvider: DataContextProvider): CacheStorage<TType> {
        return new NativeDBAdapter(this.bridge, type, contextProvider);
    }

    createGlobalSearchSource(): IGlobalCacheSearchSource {
        return new NativeGlobalSearchSource(this.bridge);
    }
}

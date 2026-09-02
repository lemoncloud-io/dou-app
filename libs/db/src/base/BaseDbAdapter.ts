import type { CacheModelOf, CacheQueryOf, CacheType } from '@chatic/app-messages';
import type { CacheStorage, DataContextProvider } from '@chatic/data';
import { resolveScopedContext } from '@chatic/data';

/**
 * 모든 데이터베이스 어댑터(IndexedDB, Native 등)의 공통 기반이 되는 추상 클래스입니다.
 *
 * @template TType 캐시 도메인 타입
 */
export abstract class BaseDbAdapter<TType extends CacheType> implements CacheStorage<TType> {
    constructor(
        protected readonly type: TType,
        protected readonly contextProvider: DataContextProvider
    ) {}

    /**
     * 도메인 타입 정책에 따른 스코프(cid, uid)를 결정합니다.
     */
    protected getScope(): { cid: string; uid: string } {
        return resolveScopedContext(this.type, this.contextProvider);
    }

    abstract save(id: string, item: CacheModelOf<TType>): Promise<CacheModelOf<TType>>;
    abstract saveAll(items: CacheModelOf<TType>[]): Promise<CacheModelOf<TType>[]>;
    abstract load(id: string): Promise<CacheModelOf<TType> | null>;
    abstract loadAll(options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]>;
    abstract delete(id: string): Promise<void>;
    abstract deleteAll(ids: string[]): Promise<void>;
    abstract clearAll(): Promise<void>;

    /**
     * 기본 구현은 `load`를 병렬로 반복합니다 — 저장소가 브릿지 뒤에 있지 않다면(IndexedDB) 그게
     * 곧 최선이라서 어댑터가 굳이 재정의할 이유가 없습니다. 브릿지 뒤에 있는 `NativeDBAdapter`만
     * 재정의해서 왕복을 1회로 접습니다.
     *
     * `null`을 걸러내므로 반환 길이와 순서는 `ids`와 일치하지 않습니다 — 호출자가 id로 다시
     * 색인하는 전제입니다.
     */
    async loadMany(ids: string[]): Promise<CacheModelOf<TType>[]> {
        if (ids.length === 0) return [];
        const items: Array<CacheModelOf<TType> | null> = await Promise.all(ids.map(id => this.load(id)));
        return items.filter((item): item is CacheModelOf<TType> => !!item);
    }

    /**
     * 기본 구현은 테이블 전체를 읽어 id를 골라내고 지웁니다. `IndexedDBAdapter`는 채널 인덱스 범위로
     * 재정의하지만, 네이티브에는 채널 필터가 있는 삭제 메시지가 없어서 이 경로를 그대로 씁니다.
     *
     * **네이티브에서는 이게 해당 scope의 채팅 전량을 브릿지로 끌어옵니다.** 지금은 프로덕션 호출자가
     * 없어서(테스트만 부릅니다) 실제 비용이 발생하지 않으므로 그대로 둡니다. 이걸 실사용 경로에
     * 붙이려면 먼저 `ClearCacheData`에 channelId 필터를 추가하고 구버전 폴백을 갖춰야 합니다 —
     * 그 전에 호출하면 채널 하나 비우는 데 테이블 전체 전송이 붙습니다.
     */
    async clearByChannelId(channelId: string): Promise<void> {
        const items = await this.loadAll();
        const ids = items
            .filter(item => (item as any).channelId === channelId)
            .map(item => (item as any).id as string)
            .filter(Boolean);
        if (ids.length > 0) {
            await this.deleteAll(ids);
        }
    }
}

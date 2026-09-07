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
     * 기본 구현은 읽어서 고르고 지웁니다 — 삭제 자체를 채널로 좁히는 수단이 없는 저장소를 위한
     * 경로입니다. `IndexedDBAdapter`는 채널 인덱스 범위로, `NativeDBAdapter`는 전용 브릿지
     * 메시지로 재정의하며, 그 메시지를 모르는 구버전 앱에서 여기로 되돌아옵니다(ADR-0067).
     *
     * **읽기는 채널로 좁혀서 합니다.** `channelId`를 쿼리로 선언한 도메인(chat·join)에서는 그 채널의
     * 행만 오므로, 방 하나를 비우는 데 테이블 전체가 브릿지를 건너오지 않습니다. 그 외 도메인에는
     * 좁힐 근거가 없어 예전처럼 전량을 훑습니다 — 실제 호출자는 chat 하나뿐입니다.
     */
    async clearByChannelId(channelId: string): Promise<void> {
        const items = await this.loadAll(this.asChannelQuery(channelId));
        const ids = items
            .filter(item => (item as any).channelId === channelId)
            .map(item => (item as any).id as string)
            .filter(Boolean);
        if (ids.length > 0) {
            await this.deleteAll(ids);
        }
    }

    /**
     * 이 도메인의 조회 쿼리가 `channelId`를 받는다면 그 필터를, 아니면 `undefined`를 줍니다.
     *
     * 캐스트가 필요한 이유: `CacheQueryOf<TType>`은 도메인별 매핑 타입이라 제네릭 `TType` 안에서는
     * 좁혀지지 않습니다. 런타임 가드가 그 안전성을 대신 보증하며, 이건 `loadLastPerChannel`이
     * `this.type !== 'chat'`으로 chat 전용 경로를 가르는 것과 같은 관용구입니다.
     */
    private asChannelQuery(channelId: string): CacheQueryOf<TType> | undefined {
        const isChannelScoped = this.type === 'chat' || this.type === 'join';
        return isChannelScoped ? ({ channelId } as CacheQueryOf<TType>) : undefined;
    }
}

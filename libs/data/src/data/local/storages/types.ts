import type { CacheModelOf, CacheQueryOf, CacheType } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories-v2/types';
import { resolveScopedContext } from './utils';

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

/**
 * 실제 저장소 구현체(IndexedDB/native 등)가 만족해야 하는 공통 인터페이스입니다.
 * 모든 상위 팩터리 타입은 이 인터페이스를 중심으로 연결됩니다.
 *
 * @template TType 캐시 도메인 타입 (예: 'channel', 'chat' 등)
 */
export interface CacheStorage<TType extends CacheType> {
    save(id: string, item: CacheModelOf<TType>): Promise<CacheModelOf<TType>>;
    saveAll(items: CacheModelOf<TType>[]): Promise<CacheModelOf<TType>[]>;
    load(id: string): Promise<CacheModelOf<TType> | null>;
    /**
     * id 목록으로 여러 행을 읽습니다. `load`를 id마다 부르는 것과 결과는 같습니다.
     *
     * 없는 id는 결과에서 빠지므로 **반환 길이와 순서가 `ids`와 일치하지 않습니다.** 호출자는
     * `new Map(items.map(item => [item.id, item]))`처럼 id로 다시 색인해야 합니다. 위치로 짝을
     * 맞추면(`items[index]`) 중간에 없는 id가 하나라도 있으면 그 뒤가 전부 밀립니다.
     */
    loadMany(ids: string[]): Promise<CacheModelOf<TType>[]>;
    loadAll(options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]>;
    delete(id: string): Promise<void>;
    deleteAll(ids: string[]): Promise<void>;
    clearAll(): Promise<void>;
    clearByChannelId(channelId: string): Promise<void>;
}

/**
 * 캐시 저장소에 보관되는 모델 타입 단축 정의
 */
export type CacheStorageItem<TType extends CacheType> = CacheModelOf<TType>;

/**
 * 데이터베이스에 저장될 레코드의 기본 스키마를 정의합니다.
 *
 * @template TType 캐시 도메인 타입
 */
export interface CacheSchema<TType extends CacheType> {
    key: string; // Primary key (e.g., "channel:cid:uid:id")
    type: TType; // CacheType (e.g., "channel")
    cid: string;
    uid: string;
    id: string; // Original ID
    data: CacheModelOf<TType>;
}

import type { CacheModelOf, CacheQueryOf, CacheType } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories/types';
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

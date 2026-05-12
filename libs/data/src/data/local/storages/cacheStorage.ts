import type { CacheModelMap, CacheType } from '@chatic/app-messages';

/** CacheType에 대응되는 개별 캐시 아이템 타입입니다. */
export type CacheStorageItem<TType extends CacheType> = CacheModelMap[TType];

/**
 * 실제 저장소 구현체(IndexedDB/native 등)가 만족해야 하는 공통 인터페이스입니다.
 * 모든 상위 팩터리 타입은 이 인터페이스를 중심으로 연결됩니다.
 */
export interface CacheStorage<TType extends CacheType> {
    save(id: string, item: CacheStorageItem<TType>): Promise<CacheStorageItem<TType>>;
    saveAll(items: CacheStorageItem<TType>[]): Promise<CacheStorageItem<TType>[]>;
    load(id: string): Promise<CacheStorageItem<TType> | null>;
    loadAll(): Promise<CacheStorageItem<TType>[]>;
    delete(id: string): Promise<void>;
    deleteAll(ids: string[]): Promise<void>;
    clearAll(): Promise<void>;
}

export interface CacheSchema<T> {
    key: string;
    type: string;
    cid: string;
    uid: string;
    id: string;
    data: T;
}

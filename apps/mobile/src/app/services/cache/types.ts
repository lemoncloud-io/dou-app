import type { CacheModelMap, CacheQueryMap, CacheType, PagingMeta } from '@chatic/app-messages';

export interface ICacheCrudService {
    /**
     * [조회] 단건 캐시 데이터 조회
     */
    fetch<K extends CacheType>(payload: {
        type: K;
        id: string;
        cid?: string;
        uid?: string;
    }): Promise<CacheModelMap[K] | null>;

    /**
     * [조회] 다수/페이징 캐시 조회
     */
    fetchAll<K extends CacheType>(payload: {
        type: K;
        query?: CacheQueryMap[K] & PagingMeta;
        cid?: string;
        uid?: string;
    }): Promise<CacheModelMap[K][]>;

    /**
     * [저장] 단일 아이템 저장
     */
    save<K extends CacheType>(payload: {
        type: K;
        id: string;
        item: CacheModelMap[K];
        cid: string;
        uid: string;
    }): Promise<string>;

    /**
     * [저장] 다수 아이템 일괄 저장
     */
    saveAll<K extends CacheType>(payload: {
        type: K;
        items: CacheModelMap[K][];
        cid: string;
        uid: string;
        query?: CacheQueryMap[K] & PagingMeta;
    }): Promise<string[]>;

    /**
     * [삭제] 단일 아이템 삭제
     */
    delete<K extends CacheType>(payload: { type: K; id: string; cid: string; uid: string }): Promise<string>;

    /**
     * [삭제] 다수 아이템 일괄 삭제
     */
    deleteAll<K extends CacheType>(payload: { type: K; ids: string[]; cid: string; uid: string }): Promise<string[]>;

    /**
     * [초기화] 특정 도메인 전체 삭제
     */
    clear<K extends CacheType>(payload: { type: K; cid?: string; uid?: string }): Promise<void>;
}

export interface ICacheSearchService {
    /**
     * [검색] 캐시 데이터 검색
     */
    search(keyword: string, cid?: string, uid?: string): Promise<any[]>;
}

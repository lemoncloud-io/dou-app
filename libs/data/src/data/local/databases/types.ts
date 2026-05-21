import type { CacheQueryOf, CacheTtlMeta, CacheType } from '@chatic/app-messages';
import type { CacheSchema } from '../storages';

/**
 * IndexedDB에 저장될 레코드의 타입 정의입니다.
 *
 * @template TType 캐시 도메인 타입 (예: 'channel', 'chat' 등)
 */
export type IndexedDbRow<TType extends CacheType> = CacheSchema<TType> & {
    meta?: CacheTtlMeta;
    channel_id?: string;
    chat_no?: number;
};

/**
 * 커서 기반 쿼리에 사용될 옵션을 정의합니다.
 *
 * @template TType 캐시 도메인 타입
 */
export interface CursorQueryOptions<TType extends CacheType> {
    indexName: string;
    range: IDBKeyRange;
    direction: IDBCursorDirection;
    limit: number;
    /**
     * 커서가 각 레코드를 순회할 때 호출되는 필터 함수입니다.
     *
     * @param item - 현재 순회 중인 레코드
     * @returns 포함 여부
     */
    filter: (item: IndexedDbRow<TType>) => boolean;
}

/**
 * IndexedDB와 연동하는 저수준 공통 인터페이스입니다.
 */
export interface IIndexedDB {
    /**
     * 단일 아이템을 추가하거나 업데이트합니다.
     */
    save<TType extends CacheType>(item: IndexedDbRow<TType>): Promise<void>;

    /**
     * 여러 아이템을 일괄 추가하거나 업데이트합니다.
     */
    saveAll<TType extends CacheType>(items: IndexedDbRow<TType>[]): Promise<void>;

    /**
     * 기본 키를 사용하여 단일 아이템을 로드합니다.
     */
    load<TType extends CacheType>(key: string): Promise<IndexedDbRow<TType> | undefined>;

    /**
     * 인덱스를 활용하여 매칭되는 모든 아이템들을 로드합니다.
     */
    loadAll<TType extends CacheType>(indexName: string, key: IDBValidKey): Promise<IndexedDbRow<TType>[]>;

    /**
     * 커서를 활용하여 최적화된 페이징 쿼리를 수행합니다.
     */
    loadWithCursor<TType extends CacheType>(options: CursorQueryOptions<TType>): Promise<IndexedDbRow<TType>[]>;

    /**
     * 기본 키를 사용하여 단일 레코드를 삭제합니다.
     */
    delete(key: string): Promise<void>;

    /**
     * 여러 개의 기본 키에 해당하는 레코드들을 일괄 삭제합니다.
     */
    deleteAll(keys: string[]): Promise<void>;

    /**
     * 인덱스 기반으로 조건에 부합하는 모든 레코드를 삭제합니다.
     */
    clearAll(indexName: string, key: IDBValidKey): Promise<void>;
}

/**
 * IndexedDB에서 도메인별 복잡한 페이징/필터링 쿼리를 캡슐화하기 위한 실행기 인터페이스입니다.
 *
 * @template TType 캐시 도메인 타입
 */
export interface IndexedDbQueryExecutor<TType extends CacheType> {
    /**
     * 지정된 쿼리 조건으로 IndexedDB 레코드를 로드합니다.
     *
     * @param db 저수준 IndexedDB 데이터베이스 인터페이스
     * @param scope type, cid, uid를 담은 조회 스코프
     * @param options 도메인별 쿼리 조건 옵션
     */
    execute(
        db: IIndexedDB,
        scope: { type: TType; cid: string; uid: string },
        options?: CacheQueryOf<TType>
    ): Promise<IndexedDbRow<TType>[]>;
}

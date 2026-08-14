import type { Scalar, SQLBatchTuple, QueryResult, BatchQueryResult } from '@op-engineering/op-sqlite';

export interface IKeyValueStorage {
    set<T>(key: string, value: T): Promise<void>;
    get<T>(key: string): Promise<T | null>;
    remove(key: string): Promise<void>;
    clearAll(): Promise<void>;
    getAllKeys(): string[];
}

export interface ISqliteDatabase {
    initTables(): Promise<void>;
    /**
     * 마이그레이션이 끝난 뒤 **실제로 도달한** `PRAGMA user_version`을 반환합니다.
     *
     * `TARGET_VERSION`(의도한 값)과 다를 수 있고, 그 차이가 이 메서드의 존재 이유입니다 — 마이그레이션
     * 전체가 단일 트랜잭션이라 어느 한 스텝이 실패하면 전부 롤백되고 이 값은 오르지 않습니다. 즉 이
     * 숫자 하나가 "어떤 테이블이 존재하는가"를 완전히 결정합니다(ADR-0053 결정 8).
     */
    getSchemaVersion(): Promise<number>;
    /**
     * 단일 SQL 쿼리를 실행합니다.
     *
     * @param query - 실행할 SQL 쿼리 문자열 (예: `SELECT * FROM users WHERE id = ?`)
     * @param params - 쿼리의 `?` 플레이스홀더에 바인딩할 파라미터 배열 (선택 사항)
     * @returns 쿼리 실행 결과. 조회(SELECT) 쿼리의 경우 `rows` 배열에 결과 데이터가 반환됩니다.
     */
    execute(query: string, params?: Scalar[]): Promise<QueryResult>;
    /**
     * 여러 SQL 쿼리를 일괄 처리(Batch)로 실행합니다.
     * 대량의 데이터를 삽입(Insert)하거나 수정/삭제할 때 성능을 향상시키기 위해 사용됩니다.
     *
     * @param commands - 실행할 `[SQL 쿼리 문자열, 파라미터 배열]` 형태의 튜플 목록
     * @returns 모든 일괄 처리가 성공적으로 완료되면 resolve 되는 Promise
     */
    executeBatch(commands: SQLBatchTuple[]): Promise<BatchQueryResult>;
    backup(destFilePath: string): Promise<void>;
    restore(sourceFilePath: string): Promise<void>;
    close(): void;
}

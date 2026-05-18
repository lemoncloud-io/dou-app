/**
 * 데이터베이스 작업을 수행하기 위한 추상화된 서비스 인터페이스입니다.
 * 외부 데이터베이스 모듈(예: SQLite)과의 강한 결합을 피하고 의존성 주입을 용이하게 합니다.
 */
export interface IDatabaseService {
    /**
     * 단일 SQL 쿼리를 실행합니다.
     *
     * @param sql - 실행할 SQL 쿼리 문자열 (예: `SELECT * FROM users WHERE id = ?`)
     * @param params - 쿼리의 `?` 플레이스홀더에 바인딩할 파라미터 배열 (선택 사항)
     * @returns 쿼리 실행 결과. 조회(SELECT) 쿼리의 경우 `rows` 배열에 결과 데이터가 반환됩니다.
     */
    execute(sql: string, params?: (string | number)[]): Promise<{ rows?: any[] }>;

    /**
     * 여러 SQL 쿼리를 일괄 처리(Batch)로 실행합니다.
     * 대량의 데이터를 삽입(Insert)하거나 수정/삭제할 때 성능을 향상시키기 위해 사용됩니다.
     *
     * @param commands - 실행할 `[SQL 쿼리 문자열, 파라미터 배열]` 형태의 튜플 목록
     * @returns 모든 일괄 처리가 성공적으로 완료되면 resolve 되는 Promise
     */
    executeBatch(commands: [string, any[]][]): Promise<void>;
}

import type { ISqliteDatabase } from '../../database';

/**
 * SQLite `?` 바인딩 상한(SQLITE_MAX_VARIABLE_NUMBER)에 걸리지 않도록 나눠 보낼 청크 크기입니다.
 *
 * op-sqlite가 쓰는 상한은 빌드에 따라 999 또는 32766인데, 낮은 쪽을 기준으로 잡아야 안전합니다.
 * id 청크당 cid/uid 바인딩 2개가 더 붙으므로 900으로 여유를 둡니다. 청크가 여러 개여도 브릿지
 * 왕복은 여전히 1회입니다 — 나뉘는 건 프로세스 안의 SQLite 쿼리뿐입니다.
 */
const MAX_IDS_PER_QUERY = 900;

/**
 * id 목록으로 행을 한 번에 읽습니다. 모든 캐시 테이블이 `(cid, uid, id)` 복합 키와 `data` JSON
 * 컬럼이라는 같은 모양이라 도메인마다 복사할 이유가 없습니다.
 *
 * `WHERE` 조합은 각 데이터 소스의 `fetch`와 정확히 같은 규칙을 따릅니다 — `cid`/`uid`가 주어지면
 * 조건에 넣고, 없으면 넣지 않습니다(invitecloud는 전역 스코프라 둘 다 넘기지 않습니다). 규칙이
 * 어긋나면 배치 경로와 단건 경로가 다른 답을 내므로, 이 대응은 지켜져야 합니다.
 *
 * 없는 id는 결과에서 그냥 빠집니다. 요청 순서도 보존하지 않습니다 — 호출자가 id로 다시 색인합니다.
 */
export const fetchManyByIds = async <T>(
    database: ISqliteDatabase,
    tableName: string,
    ids: string[],
    cid?: string,
    uid?: string
): Promise<T[]> => {
    if (ids.length === 0) return [];

    // 중복 id는 SQL 이전에 접습니다. 상위(cacheWriteMany)가 중복을 보낼 수 있고, 중복이 그대로
    // 내려가면 같은 행이 여러 번 파싱되어 돌아옵니다.
    const uniqueIds = Array.from(new Set(ids));
    const rows: T[] = [];

    for (let offset = 0; offset < uniqueIds.length; offset += MAX_IDS_PER_QUERY) {
        const chunk = uniqueIds.slice(offset, offset + MAX_IDS_PER_QUERY);
        const conditions = [`id IN (${chunk.map(() => '?').join(', ')})`];
        const params: (string | number)[] = [...chunk];

        if (cid) {
            conditions.push('cid = ?');
            params.push(cid);
        }
        if (uid) {
            conditions.push('uid = ?');
            params.push(uid);
        }

        const result = await database.execute(
            `SELECT data FROM ${tableName} WHERE ${conditions.join(' AND ')}`,
            params
        );

        for (const row of result.rows || []) {
            rows.push(JSON.parse((row as any).data as string) as T);
        }
    }

    return rows;
};

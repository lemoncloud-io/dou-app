import type { ISqliteDatabase } from '../../database';

/**
 * The chunk size used to split queries so we don't hit SQLite's `?` binding limit
 * (SQLITE_MAX_VARIABLE_NUMBER).
 *
 * The limit op-sqlite uses is either 999 or 32766 depending on the build, so we have to stay under
 * the lower one to be safe. Each id chunk also carries 2 more bindings for cid/uid, so we leave
 * headroom at 900. Even with multiple chunks, the bridge round trip is still just 1 — only the
 * in-process SQLite query gets split.
 */
const MAX_IDS_PER_QUERY = 900;

/**
 * Reads rows in one pass from a list of ids. Every cache table shares the same shape — a
 * `(cid, uid, id)` composite key plus a `data` JSON column — so there's no reason to duplicate
 * this per domain.
 *
 * The `WHERE` composition follows exactly the same rule as each data source's `fetch` — `cid`/`uid`
 * are added to the condition when given, and omitted when not (invitecloud is global scope, so it
 * passes neither). If this rule ever diverges, the batch path and the single-fetch path would give
 * different answers, so this correspondence must be maintained.
 *
 * Missing ids are simply dropped from the result. Request order is not preserved either — the
 * caller re-indexes by id.
 */
export const fetchManyByIds = async <T>(
    database: ISqliteDatabase,
    tableName: string,
    ids: string[],
    cid?: string,
    uid?: string
): Promise<T[]> => {
    if (ids.length === 0) return [];

    // Duplicate ids are deduped before hitting SQL. The caller (cacheWriteMany) can send
    // duplicates, and if they pass through as-is, the same row would be parsed and returned multiple times.
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

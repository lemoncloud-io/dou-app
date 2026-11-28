import type { ISqliteDatabase } from '../types';

const MAX_IDS_PER_QUERY = 900;

export const fetchManyByIds = async <T>(
    database: ISqliteDatabase,
    tableName: string,
    ids: string[],
    cid?: string,
    uid?: string
): Promise<T[]> => {
    if (ids.length === 0) return [];

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

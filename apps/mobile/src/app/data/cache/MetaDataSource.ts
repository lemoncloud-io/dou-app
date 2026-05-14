import type { CacheType } from '@chatic/app-messages';
import { TABLES } from '../../database';
import { database } from '../../services';

export interface CacheQuerySnapshot {
    ids: string[];
    uid?: string;
}

/**
 * 쿼리 결과(ID 리스트) 보존을 위한 메타데이터 소스입니다.
 * 실시간 데이터 추가로 인한 페이징 이탈 현상을 방지합니다.
 */
export class MetaDataSource {
    /** 특정 쿼리 조건에 대한 ID 리스트와 메타 정보를 가져옵니다. */
    public async fetch(type: CacheType, cid: string, uid: string, key: string): Promise<CacheQuerySnapshot | null> {
        const sql = `SELECT data FROM ${TABLES.METAS} WHERE type = ? AND cid = ? AND uid = ? AND key = ?`;
        const result = await database.execute(sql, [type, cid, uid, key]);

        if (result.rows && result.rows.length > 0) {
            return JSON.parse(result.rows[0].data as string) as CacheQuerySnapshot;
        }
        return null;
    }

    /** 쿼리 결과를 저장합니다. 이후 로컬 DB 총량이 변해도 이 ID 목록은 유지됩니다. */
    public async save(type: CacheType, cid: string, uid: string, key: string, data: CacheQuerySnapshot): Promise<void> {
        const sql = `INSERT OR REPLACE INTO ${TABLES.METAS} (type, cid, uid, key, data, updated_at) VALUES (?, ?, ?, ?, ?, ?)`;
        const dataToSave = JSON.stringify({ ...data, uid });
        await database.execute(sql, [type, cid, uid, key, dataToSave, Date.now()]);
    }

    /** 특정 쿼리 캐시 삭제 */
    public async remove(type: CacheType, cid: string, uid: string, key: string): Promise<void> {
        await database.execute(`DELETE FROM ${TABLES.METAS} WHERE type = ? AND cid = ? AND uid = ? AND key = ?`, [
            type,
            cid,
            uid,
            key,
        ]);
    }

    /** 도메인/스코프 단위 초기화 */
    public async clear(type?: CacheType, cid?: string, uid?: string): Promise<void> {
        const conditions: string[] = [];
        const params: string[] = [];

        if (type) {
            conditions.push('type = ?');
            params.push(type as string);
        }
        if (cid) {
            conditions.push('cid = ?');
            params.push(cid);
        }
        if (uid) {
            conditions.push('uid = ?');
            params.push(uid);
        }

        const sql =
            conditions.length > 0
                ? `DELETE FROM ${TABLES.METAS} WHERE ${conditions.join(' AND ')}`
                : `DELETE FROM ${TABLES.METAS}`;
        await database.execute(sql, params);
    }
}

import { database, TABLES } from '../core';
import type { CacheType, CacheMetaView } from '@chatic/app-messages';

/**
 * 쿼리 결과(ID 리스트) 보존을 위한 메타데이터 소스입니다.
 * 실시간 데이터 추가로 인한 페이징 이탈 현상을 방지합니다.
 */
export const metaDataSource = {
    /** 특정 쿼리 조건에 대한 ID 리스트와 메타 정보를 가져옵니다. */
    fetch: async (type: CacheType, cid: string, key: string): Promise<CacheMetaView | null> => {
        const sql = `SELECT data FROM ${TABLES.METAS} WHERE type = ? AND cid = ? AND key = ?`;
        const result = await database.execute(sql, [type, cid, key]);

        if (result.rows && result.rows.length > 0) {
            return JSON.parse(result.rows[0].data as string) as CacheMetaView;
        }
        return null;
    },

    /** 쿼리 결과를 저장합니다. 이후 로컬 DB 총량이 변해도 이 ID 목록은 유지됩니다. */
    save: async (type: CacheType, cid: string, key: string, data: CacheMetaView): Promise<void> => {
        const sql = `INSERT OR REPLACE INTO ${TABLES.METAS} (type, cid, key, data, updated_at) VALUES (?, ?, ?, ?, ?)`;
        await database.execute(sql, [type, cid, key, JSON.stringify({ ...data, cid }), Date.now()]);
    },

    /** 특정 쿼리 캐시 삭제 */
    remove: async (type: CacheType, cid: string, key: string) => {
        await database.execute(`DELETE FROM ${TABLES.METAS} WHERE type = ? AND cid = ? AND key = ?`, [type, cid, key]);
    },

    /** 도메인 전체 초기화 */
    clear: async (type?: CacheType) => {
        const sql = type ? `DELETE FROM ${TABLES.METAS} WHERE type = ?` : `DELETE FROM ${TABLES.METAS}`;
        const params = type ? [type] : [];
        await database.execute(sql, params);
    },
};

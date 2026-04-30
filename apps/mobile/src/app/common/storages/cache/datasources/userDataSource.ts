import { database, TABLES } from '../../../database';
import type { ICacheDataSource } from './ICacheDataSource';
import type { CacheUserView, UserQueryOptions } from '@chatic/app-messages';

/**
 * 유저(User) 프로필 도메인 전용 데이터 소스
 */
export const userDataSource: ICacheDataSource<CacheUserView, UserQueryOptions> = {
    fetch: async (id, cid) => {
        const query = cid
            ? `SELECT data FROM ${TABLES.USERS} WHERE id = ? AND cid = ?`
            : `SELECT data FROM ${TABLES.USERS} WHERE id = ?`;
        const params = cid ? [id, cid] : [id];

        const result = await database.execute(query, params);
        if (result.rows && result.rows.length > 0) return JSON.parse(result.rows[0].data as string) as CacheUserView;
        return null;
    },

    /**
     * 특정 클라우드 내의 전체 유저 목록을 조회합니다.
     */
    fetchAll: async (cid, _query) => {
        const query = cid ? `SELECT data FROM ${TABLES.USERS} WHERE cid = ?` : `SELECT data FROM ${TABLES.USERS}`;
        const params = cid ? [cid] : [];

        const result = await database.execute(query, params);
        return (result.rows || []).map(row => JSON.parse(row.data as string) as CacheUserView);
    },

    save: async (id, item, cid) => {
        const sql = `INSERT OR REPLACE INTO ${TABLES.USERS} (cid, id, data) VALUES (?, ?, ?)`;
        const dataToSave = JSON.stringify({ ...item, id, cid });
        await database.execute(sql, [cid, id, dataToSave]);
    },

    saveAll: async (items, cid) => {
        if (items.length === 0) return;
        const sql = `INSERT OR REPLACE INTO ${TABLES.USERS} (cid, id, data) VALUES (?, ?, ?)`;

        const commands: [string, any[]][] = items.map(item => [
            sql,
            [cid, item.id, JSON.stringify({ ...item.data, id: item.id, cid })],
        ]);
        await database.executeBatch(commands);
    },

    remove: async (id, cid) => {
        await database.execute(`DELETE FROM ${TABLES.USERS} WHERE id = ? AND cid = ?`, [id, cid]);
    },

    removeAll: async (ids, cid) => {
        if (ids.length === 0) return;
        const sql = `DELETE FROM ${TABLES.USERS} WHERE id = ? AND cid = ?`;
        await database.executeBatch(ids.map(id => [sql, [id, cid]]));
    },

    clear: async () => {
        await database.execute(`DELETE FROM ${TABLES.USERS}`);
    },
};

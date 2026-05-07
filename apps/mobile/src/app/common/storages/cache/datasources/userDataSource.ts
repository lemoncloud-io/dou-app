import { database, TABLES } from '../../../database';
import type { ICacheDataSource } from './ICacheDataSource';
import type { CacheUserView, UserQueryOptions } from '@chatic/app-messages';

/**
 * 유저(User) 프로필 도메인 전용 데이터 소스
 */
export const userDataSource: ICacheDataSource<CacheUserView, UserQueryOptions> = {
    fetch: async (id, cid, uid) => {
        let query = `SELECT data FROM ${TABLES.USERS} WHERE id = ?`;
        const params: (string | number)[] = [id];
        if (cid) {
            query += ` AND cid = ?`;
            params.push(cid);
        }
        if (uid) {
            query += ` AND uid = ?`;
            params.push(uid);
        }

        const result = await database.execute(query, params);
        if (result.rows && result.rows.length > 0) return JSON.parse(result.rows[0].data as string) as CacheUserView;
        return null;
    },

    /**
     * 특정 클라우드 내의 전체 유저 목록을 조회합니다.
     */
    fetchAll: async (cid, _query, uid) => {
        const conditions: string[] = [];
        const params: string[] = [];
        if (cid) {
            conditions.push('cid = ?');
            params.push(cid);
        }
        if (uid) {
            conditions.push('uid = ?');
            params.push(uid);
        }

        const query =
            conditions.length > 0
                ? `SELECT data FROM ${TABLES.USERS} WHERE ${conditions.join(' AND ')}`
                : `SELECT data FROM ${TABLES.USERS}`;

        const result = await database.execute(query, params);
        return (result.rows || []).map(row => JSON.parse(row.data as string) as CacheUserView);
    },

    save: async (id, item, cid, uid) => {
        const sql = `INSERT OR REPLACE INTO ${TABLES.USERS} (cid, uid, id, data) VALUES (?, ?, ?, ?)`;
        const dataToSave = JSON.stringify({ ...item, id, cid, uid });
        await database.execute(sql, [cid, uid, id, dataToSave]);
    },

    saveAll: async (items, cid, uid) => {
        if (items.length === 0) return;
        const sql = `INSERT OR REPLACE INTO ${TABLES.USERS} (cid, uid, id, data) VALUES (?, ?, ?, ?)`;

        const commands: [string, any[]][] = items.map(item => [
            sql,
            [cid, uid, item.id, JSON.stringify({ ...item.data, id: item.id, cid, uid })],
        ]);
        await database.executeBatch(commands);
    },

    remove: async (id, cid, uid) => {
        await database.execute(`DELETE FROM ${TABLES.USERS} WHERE id = ? AND cid = ? AND uid = ?`, [id, cid, uid]);
    },

    removeAll: async (ids, cid, uid) => {
        if (ids.length === 0) return;
        const sql = `DELETE FROM ${TABLES.USERS} WHERE id = ? AND cid = ? AND uid = ?`;
        await database.executeBatch(ids.map(id => [sql, [id, cid, uid]]));
    },

    clear: async (cid, uid) => {
        const conditions: string[] = [];
        const params: string[] = [];
        if (cid) {
            conditions.push('cid = ?');
            params.push(cid);
        }
        if (uid) {
            conditions.push('uid = ?');
            params.push(uid);
        }
        const query =
            conditions.length > 0
                ? `DELETE FROM ${TABLES.USERS} WHERE ${conditions.join(' AND ')}`
                : `DELETE FROM ${TABLES.USERS}`;
        await database.execute(query, params);
    },
};

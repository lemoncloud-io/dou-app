import { database, TABLES } from '../../../database';
import type { ICacheDataSource } from './ICacheDataSource';
import type { CacheSiteView, SiteQueryOptions } from '@chatic/app-messages';

/**
 * 사이트(Site/Place) 도메인 전용 데이터 소스
 */
export const siteDataSource: ICacheDataSource<CacheSiteView, SiteQueryOptions> = {
    fetch: async (id, cid, uid) => {
        let query = `SELECT data FROM ${TABLES.SITES} WHERE id = ?`;
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
        if (result.rows && result.rows.length > 0) return JSON.parse(result.rows[0].data as string) as CacheSiteView;
        return null;
    },

    fetchAll: async (cid, query, uid) => {
        let sql = `SELECT data FROM ${TABLES.SITES}`;
        const params: (string | number)[] = [];
        const conditions: string[] = [];

        if (cid) {
            conditions.push(`cid = ?`);
            params.push(cid);
        }
        if (uid) {
            conditions.push(`uid = ?`);
            params.push(uid);
        }

        if (query?.keyword) {
            conditions.push(`name LIKE ?`);
            params.push(`%${query.keyword}%`);
        }

        if (conditions.length > 0) sql += ` WHERE ` + conditions.join(' AND ');

        const result = await database.execute(sql, params);
        return (result.rows || []).map(row => JSON.parse(row.data as string) as CacheSiteView);
    },

    save: async (id, item, cid, uid) => {
        const sql = `INSERT OR REPLACE INTO ${TABLES.SITES} (cid, uid, id, name, data) VALUES (?, ?, ?, ?, ?)`;
        const name = item.name || '';

        const dataToSave = JSON.stringify({
            ...item,
            id,
            cid,
            uid,
            name,
        });

        await database.execute(sql, [cid, uid, id, name, dataToSave]);
    },

    saveAll: async (items, cid, uid) => {
        if (items.length === 0) return;
        const sql = `INSERT OR REPLACE INTO ${TABLES.SITES} (cid, uid, id, name, data) VALUES (?, ?, ?, ?, ?)`;

        const commands: [string, any[]][] = items.map(item => {
            const id = item.id;
            const name = item.data.name || '';
            return [sql, [cid, uid, id, name, JSON.stringify({ ...item.data, id, cid, uid, name })]];
        });
        await database.executeBatch(commands);
    },

    remove: async (id, cid, uid) => {
        await database.execute(`DELETE FROM ${TABLES.SITES} WHERE id = ? AND cid = ? AND uid = ?`, [id, cid, uid]);
    },

    removeAll: async (ids, cid, uid) => {
        if (ids.length === 0) return;
        const sql = `DELETE FROM ${TABLES.SITES} WHERE id = ? AND cid = ? AND uid = ?`;
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
        const sql =
            conditions.length > 0
                ? `DELETE FROM ${TABLES.SITES} WHERE ${conditions.join(' AND ')}`
                : `DELETE FROM ${TABLES.SITES}`;
        await database.execute(sql, params);
    },
};

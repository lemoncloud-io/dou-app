import { database, TABLES } from '../core';
import type { ICacheDataSource } from './ICacheDataSource';
import type { CacheSiteView, SiteQueryOptions } from '@chatic/app-messages';

/**
 * 사이트(Site/Place) 도메인 전용 데이터 소스
 */
export const siteDataSource: ICacheDataSource<CacheSiteView, SiteQueryOptions> = {
    fetch: async (id, cid) => {
        const query = cid
            ? `SELECT data FROM ${TABLES.SITES} WHERE id = ? AND cid = ?`
            : `SELECT data FROM ${TABLES.SITES} WHERE id = ?`;
        const params = cid ? [id, cid] : [id];
        const result = await database.execute(query, params);
        if (result.rows && result.rows.length > 0) return JSON.parse(result.rows[0].data as string) as CacheSiteView;
        return null;
    },

    fetchAll: async (cid, query) => {
        let sql = `SELECT data FROM ${TABLES.SITES}`;
        const params: (string | number)[] = [];
        const conditions: string[] = [];

        if (cid) {
            conditions.push(`cid = ?`);
            params.push(cid);
        }

        if (query?.keyword) {
            conditions.push(`name LIKE ?`);
            params.push(`%${query.keyword}%`);
        }

        if (conditions.length > 0) sql += ` WHERE ` + conditions.join(' AND ');

        const result = await database.execute(sql, params);
        return (result.rows || []).map(row => JSON.parse(row.data as string) as CacheSiteView);
    },

    save: async (id, item, cid) => {
        const sql = `INSERT OR REPLACE INTO ${TABLES.SITES} (cid, id, name, data) VALUES (?, ?, ?, ?)`;
        await database.execute(sql, [cid, id, item.name || '', JSON.stringify({ ...item, cid })]);
    },

    saveAll: async (items, cid) => {
        if (items.length === 0) return;
        const sql = `INSERT OR REPLACE INTO ${TABLES.SITES} (cid, id, name, data) VALUES (?, ?, ?, ?)`;
        const commands: [string, any[]][] = items.map(item => [
            sql,
            [cid, item.id, item.data.name || '', JSON.stringify({ ...item.data, cid })],
        ]);
        await database.executeBatch(commands);
    },

    remove: async (id, cid) => {
        await database.execute(`DELETE FROM ${TABLES.SITES} WHERE id = ? AND cid = ?`, [id, cid]);
    },

    removeAll: async (ids, cid) => {
        if (ids.length === 0) return;
        const sql = `DELETE FROM ${TABLES.SITES} WHERE id = ? AND cid = ?`;
        await database.executeBatch(ids.map(id => [sql, [id, cid]]));
    },

    clear: async () => {
        await database.execute(`DELETE FROM ${TABLES.SITES}`);
    },
};

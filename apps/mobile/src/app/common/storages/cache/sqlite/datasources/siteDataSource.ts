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

    fetchAll: async (cid, _query) => {
        const query = cid ? `SELECT data FROM ${TABLES.SITES} WHERE cid = ?` : `SELECT data FROM ${TABLES.SITES}`;
        const params = cid ? [cid] : [];
        const result = await database.execute(query, params);
        return (result.rows || []).map(row => JSON.parse(row.data as string) as CacheSiteView);
    },

    save: async (id, item, cid) => {
        await database.execute(`INSERT OR REPLACE INTO ${TABLES.SITES} (cid, id, data) VALUES (?, ?, ?)`, [
            cid,
            id,
            JSON.stringify(item),
        ]);
    },

    saveAll: async (items, cid) => {
        if (items.length === 0) return;
        const sql = `INSERT OR REPLACE INTO ${TABLES.SITES} (cid, id, data) VALUES (?, ?, ?)`;
        await database.executeBatch(items.map(i => [sql, [cid, i.id, JSON.stringify(i.data)]]));
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

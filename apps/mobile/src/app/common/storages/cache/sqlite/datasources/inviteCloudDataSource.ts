// src/storages/sqlite/inviteCloudDataSource.ts
import { database, TABLES } from '../core';
import type { ICacheDataSource } from './ICacheDataSource';
import type { CacheCloudView, InviteCloudQueryOptions } from '@chatic/app-messages';
import { logger } from '../../../../services';

/**
 * 초대 클라우드(Invite Cloud) 도메인 전용 데이터 소스입니다.
 * 이 테이블은 시스템 전역(Global) 데이터를 보관하므로, 다른 도메인과 달리 cid(클라우드 ID)를 통한 데이터 격리 쿼리를 수행하지 않습니다.
 * (파라미터로 넘어온 _cid는 인터페이스 규격을 맞추기 위한 것이며 무시됩니다)
 */
export const inviteCloudDataSource: ICacheDataSource<CacheCloudView, InviteCloudQueryOptions> = {
    fetch: async (id, _cid) => {
        const result = await database.execute(`SELECT data FROM ${TABLES.INVITE_CLOUDS} WHERE id = ?`, [id]);
        if (result.rows && result.rows.length > 0) return JSON.parse(result.rows[0].data as string) as CacheCloudView;
        return null;
    },

    fetchAll: async (_cid, _query) => {
        const result = await database.execute(`SELECT data FROM ${TABLES.INVITE_CLOUDS}`);
        return (result.rows || []).reduce<CacheCloudView[]>((acc, row) => {
            try {
                acc.push(JSON.parse(row.data as string) as CacheCloudView);
            } catch (e) {
                logger.warn('CACHE', `InviteCloudDataSource: Json Parse Error ${e}`);
            }
            return acc;
        }, []);
    },

    save: async (id, item, _cid) => {
        await database.execute(`INSERT OR REPLACE INTO ${TABLES.INVITE_CLOUDS} (id, data) VALUES (?, ?)`, [
            id,
            JSON.stringify({ item, _cid }),
        ]);
    },

    saveAll: async (items, _cid) => {
        if (items.length === 0) return;
        const sql = `INSERT OR REPLACE INTO ${TABLES.INVITE_CLOUDS} (id, data) VALUES (?, ?)`;
        await database.executeBatch(items.map(item => [sql, [item.id, JSON.stringify({ ...item.data, _cid })]]));
    },

    remove: async (id, _cid) => {
        await database.execute(`DELETE FROM ${TABLES.INVITE_CLOUDS} WHERE id = ?`, [id]);
    },

    removeAll: async (ids, _cid) => {
        if (ids.length === 0) return;
        await database.executeBatch(ids.map(id => [`DELETE FROM ${TABLES.INVITE_CLOUDS} WHERE id = ?`, [id]]));
    },

    clear: async () => {
        await database.execute(`DELETE FROM ${TABLES.INVITE_CLOUDS}`);
    },
};

import { database, TABLES } from '../core';
import type { ICacheDataSource } from './ICacheDataSource';
import type { CacheJoinView, JoinQueryOptions } from '@chatic/app-messages';

/**
 * 참여(Join) 도메인 전용 데이터 소스 구현체
 * 유저가 어떤 채널에 참여하고 있는지, 혹은 채널에 어떤 유저들이 있는지
 * 양방향으로 빠르게 검색할 수 있도록 channel_id와 user_id를 추출하여 저장합니다.
 */
export const joinDataSource: ICacheDataSource<CacheJoinView, JoinQueryOptions> = {
    /**
     * 단일 참여 정보를 조회합니다.
     */
    fetch: async (id, cid) => {
        const query = cid
            ? `SELECT data FROM ${TABLES.JOINS} WHERE id = ? AND cid = ?`
            : `SELECT data FROM ${TABLES.JOINS} WHERE id = ?`;
        const params = cid ? [id, cid] : [id];
        const result = await database.execute(query, params);
        if (result.rows && result.rows.length > 0) return JSON.parse(result.rows[0].data as string) as CacheJoinView;
        return null;
    },

    /**
     * 조건에 맞는 참여 목록을 조회합니다.
     * @param cid
     * @param query 특정 채널(channelId) 또는 특정 유저(userId) 필터링 조건
     */
    fetchAll: async (cid, query) => {
        let sql = `SELECT data FROM ${TABLES.JOINS}`;
        const params: (string | number)[] = [];
        const conditions: string[] = [];

        // 데이터 격리 및 다중 필터링
        if (cid) {
            conditions.push(`cid = ?`);
            params.push(cid);
        }
        if (query?.channelId) {
            conditions.push(`channel_id = ?`);
            params.push(query.channelId);
        }
        if (query?.userId) {
            conditions.push(`user_id = ?`);
            params.push(query.userId);
        }

        if (conditions.length > 0) sql += ` WHERE ` + conditions.join(' AND ');

        const result = await database.execute(sql, params);
        return (result.rows || []).map(row => JSON.parse(row.data as string) as CacheJoinView);
    },

    /** 검색 최적화를 위해 channel_id와 user_id를 별도 컬럼으로 분리하여 저장합니다. */
    save: async (id, item, cid) => {
        const sql = `INSERT OR REPLACE INTO ${TABLES.JOINS} (cid, id, channel_id, user_id, data) VALUES (?, ?, ?, ?, ?)`;
        const channelId = item.channelId || '';
        const userId = item.userId || '';

        const dataToSave = JSON.stringify({
            ...item,
            id,
            cid,
            channelId,
            userId,
        });

        await database.execute(sql, [cid, id, channelId, userId, dataToSave]);
    },

    /** 다수의 참여 정보를 트랜잭션으로 일괄 저장합니다. */
    saveAll: async (items, cid) => {
        if (items.length === 0) return;
        const sql = `INSERT OR REPLACE INTO ${TABLES.JOINS} (cid, id, channel_id, user_id, data) VALUES (?, ?, ?, ?, ?)`;

        const commands: [string, any[]][] = items.map(item => {
            const id = item.id;
            const data = item.data;
            const channelId = data.channelId || '';
            const userId = data.userId || '';

            return [
                sql,
                [
                    cid,
                    id,
                    channelId,
                    userId,
                    JSON.stringify({ ...data, id, cid, channelId, userId }), // ✨ 이중 stringify 제거 및 패치
                ],
            ];
        });
        await database.executeBatch(commands);
    },

    remove: async (id, cid) => {
        await database.execute(`DELETE FROM ${TABLES.JOINS} WHERE id = ? AND cid = ?`, [id, cid]);
    },
    removeAll: async (ids, cid) => {
        if (ids.length === 0) return;
        const sql = `DELETE FROM ${TABLES.JOINS} WHERE id = ? AND cid = ?`;
        await database.executeBatch(ids.map(id => [sql, [id, cid]]));
    },
    clear: async () => {
        await database.execute(`DELETE FROM ${TABLES.JOINS}`);
    },
};

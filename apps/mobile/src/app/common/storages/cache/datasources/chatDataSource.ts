import { database, TABLES } from '../../../database';
import type { ICacheDataSource } from './ICacheDataSource';
import type { CacheChatView, ChatQueryOptions } from '@chatic/app-messages';

/**
 * 채팅(Chat) 도메인 전용 데이터 소스 구현체
 */
export const chatDataSource: ICacheDataSource<CacheChatView, ChatQueryOptions> = {
    /**
     * 특정 메시지를 단건 조회합니다.
     * @param id 메시지 고유 식별자
     * @param cid 클라우드 식별자
     */
    fetch: async (id, cid) => {
        const query = cid
            ? `SELECT data FROM ${TABLES.CHATS} WHERE id = ? AND cid = ?`
            : `SELECT data FROM ${TABLES.CHATS} WHERE id = ?`;
        const params = cid ? [id, cid] : [id];
        const result = await database.execute(query, params);

        if (result.rows && result.rows.length > 0) {
            return JSON.parse(result.rows[0].data as string) as CacheChatView;
        }
        return null;
    },

    /**
     * 조건에 맞는 메시지 목록을 조회합니다.
     * @param cid 클라우드 식별자
     * @param query 채널 ID 필터링 및 메시지 순서(sort) 정렬 조건
     */
    fetchAll: async (cid, query) => {
        let sql = `SELECT data FROM ${TABLES.CHATS}`;
        const params: (string | number)[] = [];
        const conditions: string[] = [];

        if (cid) {
            conditions.push(`cid = ?`);
            params.push(cid);
        }
        if (query?.channelId) {
            conditions.push(`channel_id = ?`);
            params.push(query.channelId);
        }

        if ((query as any)?.keyword) {
            conditions.push(`content LIKE ?`);
            params.push(`%${(query as any).keyword}%`);
        }

        if (conditions.length > 0) sql += ` WHERE ` + conditions.join(' AND ');

        if (query?.sort) sql += ` ORDER BY chat_no ${query.sort.toUpperCase()}`;

        const result = await database.execute(sql, params);
        return (result.rows || []).map(row => JSON.parse(row.data as string) as CacheChatView);
    },

    /**
     * 단일 채팅 메시지를 저장하거나 업데이트합니다. (Upsert)
     * 검색 및 정렬 최적화를 위해 channel_id, chat_no, created_at, content를 별도 컬럼으로 추출합니다.
     */
    save: async (id, item, cid) => {
        const sql = `INSERT OR REPLACE INTO ${TABLES.CHATS} (cid, id, channel_id, chat_no, created_at, content, data) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        const channelId = item.channelId || '';
        const chatNo = item.chatNo || 0;
        const createdAt = item.createdAt || 0;
        const content = item.content || '';

        const dataToSave = JSON.stringify({
            ...item,
            id,
            cid,
            channelId,
            chatNo,
            createdAt,
        });

        await database.execute(sql, [cid, id, channelId, chatNo, createdAt, content, dataToSave]);
    },

    /**
     * 다수의 채팅 메시지를 일괄 저장합니다. (Batch 삽입으로 성능 최적화)
     */
    saveAll: async (items, cid) => {
        if (items.length === 0) return;
        const sql = `INSERT OR REPLACE INTO ${TABLES.CHATS} (cid, id, channel_id, chat_no, created_at, content, data) VALUES (?, ?, ?, ?, ?, ?, ?)`;

        const commands: [string, any[]][] = items.map(item => {
            const id = item.id;
            const chatData = item.data;

            const channelId = chatData.channelId || '';
            const chatNo = chatData.chatNo || 0;
            const createdAt = chatData.createdAt || 0;
            const content = chatData.content || '';

            const dataToSave = JSON.stringify({
                ...chatData,
                id,
                cid,
                channelId,
                chatNo,
                createdAt,
            });

            return [sql, [cid, id, channelId, chatNo, createdAt, content, dataToSave]];
        });

        await database.executeBatch(commands);
    },

    /** 단일 메시지 삭제 */
    remove: async (id, cid) => {
        await database.execute(`DELETE FROM ${TABLES.CHATS} WHERE id = ? AND cid = ?`, [id, cid]);
    },

    /** 다수 메시지 일괄 삭제 */
    removeAll: async (ids, cid) => {
        if (ids.length === 0) return;
        const sql = `DELETE FROM ${TABLES.CHATS} WHERE id = ? AND cid = ?`;
        await database.executeBatch(ids.map(id => [sql, [id, cid]]));
    },

    /** 채팅 테이블의 모든 데이터 초기화 */
    clear: async () => {
        await database.execute(`DELETE FROM ${TABLES.CHATS}`);
    },
};

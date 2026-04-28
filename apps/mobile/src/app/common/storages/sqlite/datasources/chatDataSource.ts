import { database, TABLES } from '../core';
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

        // 클라우드별 데이터 격리
        if (cid) {
            conditions.push(`cid = ?`);
            params.push(cid);
        }
        // 특정 채널의 메시지만 필터링 (channel_id 컬럼 활용)
        if (query?.channelId) {
            conditions.push(`channel_id = ?`);
            params.push(query.channelId);
        }

        if (conditions.length > 0) sql += ` WHERE ` + conditions.join(' AND ');

        // 메시지 번호 기반 정렬 (chat_no 컬럼 활용)
        if (query?.sort) {
            sql += ` ORDER BY chat_no ${query.sort.toUpperCase()}`;
        }

        const result = await database.execute(sql, params);
        return (result.rows || []).map(row => JSON.parse(row.data as string) as CacheChatView);
    },

    /**
     * 단일 채팅 메시지를 저장하거나 업데이트합니다. (Upsert)
     * 검색 및 정렬 최적화를 위해 channel_id, chat_no, created_at, content를 별도 컬럼으로 추출합니다.
     */
    save: async (id, item, cid) => {
        const sql = `INSERT OR REPLACE INTO ${TABLES.CHATS} (cid, id, channel_id, chat_no, created_at, content, data) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        const content = item.content || ''; // 검색용 텍스트 추출

        await database.execute(sql, [
            cid,
            id,
            item.channelId || '',
            item.chatNo || 0,
            item.createdAt || 0,
            content,
            JSON.stringify(item),
        ]);
    },

    /**
     * 다수의 채팅 메시지를 일괄 저장합니다. (Batch 삽입으로 성능 최적화)
     */
    saveAll: async (items, cid) => {
        if (items.length === 0) return;
        const sql = `INSERT OR REPLACE INTO ${TABLES.CHATS} (cid, id, channel_id, chat_no, created_at, content, data) VALUES (?, ?, ?, ?, ?, ?, ?)`;

        const commands: [string, any[]][] = items.map(item => [
            sql,
            [
                cid,
                item.id,
                item.data.channelId || '',
                item.data.chatNo || 0,
                item.data.createdAt || 0,
                item.data.content || '',
                JSON.stringify(item.data),
            ],
        ]);
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

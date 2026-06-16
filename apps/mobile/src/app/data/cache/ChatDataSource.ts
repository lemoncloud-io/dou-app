import type { CacheChatView, ChatQueryOptions } from '@chatic/app-messages';
import type { ICacheDataSource } from './types';
import type { ISqliteDatabase } from '../../database';

/**
 * 채팅(Chat) 도메인 전용 데이터 소스 구현체
 */
export class ChatDataSource implements ICacheDataSource<CacheChatView, ChatQueryOptions> {
    constructor(
        private readonly database: ISqliteDatabase,
        private readonly tableName: string
    ) {}

    public async fetch(id: string, cid?: string, uid?: string): Promise<CacheChatView | null> {
        let query = `SELECT data FROM ${this.tableName} WHERE id = ?`;
        const params: (string | number)[] = [id];
        if (cid) {
            query += ` AND cid = ?`;
            params.push(cid);
        }
        if (uid) {
            query += ` AND uid = ?`;
            params.push(uid);
        }
        const result = await this.database.execute(query, params);

        if (result.rows && result.rows.length > 0) {
            return JSON.parse(result.rows[0].data as string) as CacheChatView;
        }
        return null;
    }

    public async fetchAll(cid?: string, query?: ChatQueryOptions, uid?: string): Promise<CacheChatView[]> {
        let sql = `SELECT data FROM ${this.tableName}`;
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
        if (query?.channelId) {
            conditions.push(`channel_id = ?`);
            params.push(query.channelId);
        }

        if (query?.keyword) {
            conditions.push(`content LIKE ?`);
            params.push(`%${query.keyword}%`);
        }

        // 페이징 커서 조건 추가 (cursorNo 미만)
        if (query?.cursorNo !== undefined && query.cursorNo !== null) {
            conditions.push(`chat_no < ?`);
            params.push(query.cursorNo);
        }

        if (conditions.length > 0) sql += ` WHERE ` + conditions.join(' AND ');

        // 정렬 기준 설정 (채팅의 경우 기본적으로 DESC가 적합하므로 없을 경우 폴백 처리)
        const sortOrder = query?.sort ? query.sort.toUpperCase() : 'DESC';
        sql += ` ORDER BY chat_no ${sortOrder}`;

        // 페이징 Limit 조건 추가
        if (query?.limit !== undefined && query.limit !== null) {
            sql += ` LIMIT ?`;
            params.push(query.limit);
        }

        const result = await this.database.execute(sql, params);

        return (result.rows || []).map((row: any) => JSON.parse(row.data as string) as CacheChatView);
    }

    public async save(id: string, item: CacheChatView, cid: string, uid: string): Promise<void> {
        const sql = `INSERT OR REPLACE INTO ${this.tableName} (cid, uid, id, channel_id, chat_no, created_at, content, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        const channelId = item.channelId || '';
        const chatNo = item.chatNo || 0;
        const createdAt = item.createdAt || 0;
        const content = item.content || '';

        const dataToSave = JSON.stringify({
            ...item,
            id,
            cid,
            uid,
            channelId,
            chatNo,
            createdAt,
        });

        await this.database.execute(sql, [cid, uid, id, channelId, chatNo, createdAt, content, dataToSave]);
    }

    public async saveAll(items: { id: string; data: CacheChatView }[], cid: string, uid: string): Promise<void> {
        if (items.length === 0) return;
        const sql = `INSERT OR REPLACE INTO ${this.tableName} (cid, uid, id, channel_id, chat_no, created_at, content, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

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
                uid,
                channelId,
                chatNo,
                createdAt,
            });

            return [sql, [cid, uid, id, channelId, chatNo, createdAt, content, dataToSave]];
        });

        await this.database.executeBatch(commands);
    }

    public async remove(id: string, cid: string, uid: string): Promise<void> {
        await this.database.execute(`DELETE FROM ${this.tableName} WHERE id = ? AND cid = ? AND uid = ?`, [
            id,
            cid,
            uid,
        ]);
    }

    public async removeAll(ids: string[], cid: string, uid: string): Promise<void> {
        if (ids.length === 0) return;
        const sql = `DELETE FROM ${this.tableName} WHERE id = ? AND cid = ? AND uid = ?`;
        await this.database.executeBatch(ids.map(id => [sql, [id, cid, uid]]));
    }

    public async clear(cid?: string, uid?: string): Promise<void> {
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
                ? `DELETE FROM ${this.tableName} WHERE ${conditions.join(' AND ')}`
                : `DELETE FROM ${this.tableName}`;
        await this.database.execute(sql, params);
    }
}

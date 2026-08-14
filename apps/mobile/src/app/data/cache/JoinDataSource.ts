import type { CacheJoinView, JoinQueryOptions } from '@chatic/app-messages';
import type { ICacheDataSource } from './types';
import type { ISqliteDatabase } from '../../database';
import { fetchManyByIds } from './fetchManyByIds';
/**
 * 참여(Join) 도메인 전용 데이터 소스 구현체
 * 유저가 어떤 채널에 참여하고 있는지, 혹은 채널에 어떤 유저들이 있는지
 * 양방향으로 빠르게 검색할 수 있도록 channel_id와 user_id를 추출하여 저장합니다.
 */
export class JoinDataSource implements ICacheDataSource<CacheJoinView, JoinQueryOptions> {
    constructor(
        private readonly database: ISqliteDatabase,
        private readonly tableName: string
    ) {}

    public async fetch(id: string, cid?: string, uid?: string): Promise<CacheJoinView | null> {
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
        if (result.rows && result.rows.length > 0) return JSON.parse(result.rows[0].data as string) as CacheJoinView;
        return null;
    }

    public async fetchMany(ids: string[], cid?: string, uid?: string): Promise<CacheJoinView[]> {
        return fetchManyByIds<CacheJoinView>(this.database, this.tableName, ids, cid, uid);
    }

    public async fetchAll(cid?: string, query?: JoinQueryOptions, uid?: string): Promise<CacheJoinView[]> {
        let sql = `SELECT data FROM ${this.tableName}`;
        const params: (string | number)[] = [];
        const conditions: string[] = [];

        // 데이터 격리 및 다중 필터링
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
        if (query?.userId) {
            conditions.push(`user_id = ?`);
            params.push(query.userId);
        }

        if (conditions.length > 0) sql += ` WHERE ` + conditions.join(' AND ');

        const result = await this.database.execute(sql, params);
        return (result.rows || []).map((row: any) => JSON.parse(row.data as string) as CacheJoinView);
    }

    public async save(id: string, item: CacheJoinView, cid: string, uid: string): Promise<void> {
        const sql = `INSERT OR REPLACE INTO ${this.tableName} (cid, uid, id, channel_id, user_id, data) VALUES (?, ?, ?, ?, ?, ?)`;
        const channelId = item.channelId || '';
        const userId = item.userId || '';

        const dataToSave = JSON.stringify({
            ...item,
            id,
            cid,
            uid,
            channelId,
            userId,
        });

        await this.database.execute(sql, [cid, uid, id, channelId, userId, dataToSave]);
    }

    public async saveAll(items: { id: string; data: CacheJoinView }[], cid: string, uid: string): Promise<void> {
        if (items.length === 0) return;
        const sql = `INSERT OR REPLACE INTO ${this.tableName} (cid, uid, id, channel_id, user_id, data) VALUES (?, ?, ?, ?, ?, ?)`;

        const commands: [string, any[]][] = items.map(item => {
            const id = item.id;
            const data = item.data;
            const channelId = data.channelId || '';
            const userId = data.userId || '';

            return [
                sql,
                [cid, uid, id, channelId, userId, JSON.stringify({ ...data, id, cid, uid, channelId, userId })],
            ];
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

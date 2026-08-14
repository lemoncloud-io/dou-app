import type { CacheChannelView, ChannelQueryOptions } from '@chatic/app-messages';
import type { ICacheDataSource } from './types';
import type { ISqliteDatabase } from '../../database';
import { fetchManyByIds } from './fetchManyByIds';

export class ChannelDataSource implements ICacheDataSource<CacheChannelView, ChannelQueryOptions> {
    constructor(
        private readonly database: ISqliteDatabase,
        private readonly tableName: string
    ) {}

    /**
     * 채널 객체에서(sid)를 안전하게 추출합니다.
     */
    private extractSid(item: any): string {
        return item?.sid ? String(item.sid) : 'default';
    }

    /**
     * 채널 객체에서 채널명(name)을 안전하게 추출합니다.
     */
    private extractName(item: any): string {
        return item?.name ? String(item.name) : '';
    }

    public async fetch(id: string, cid?: string, uid?: string): Promise<CacheChannelView | null> {
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
            return JSON.parse(result.rows[0].data as string) as CacheChannelView;
        }
        return null;
    }

    public async fetchMany(ids: string[], cid?: string, uid?: string): Promise<CacheChannelView[]> {
        return fetchManyByIds<CacheChannelView>(this.database, this.tableName, ids, cid, uid);
    }

    public async fetchAll(cid?: string, query?: ChannelQueryOptions, uid?: string): Promise<CacheChannelView[]> {
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
        if (query?.sid) {
            conditions.push(`sid = ?`);
            params.push(query.sid);
        }
        if (query?.keyword) {
            conditions.push(`name LIKE ?`);
            params.push(`%${query.keyword}%`);
        }

        if (conditions.length > 0) {
            sql += ` WHERE ` + conditions.join(' AND ');
        }

        const result = await this.database.execute(sql, params);
        return (result.rows || []).map((row: any) => JSON.parse(row.data as string) as CacheChannelView);
    }

    public async save(id: string, item: CacheChannelView, cid: string, uid: string): Promise<void> {
        const sql = `INSERT OR REPLACE INTO ${this.tableName} (cid, uid, id, sid, name, data) VALUES (?, ?, ?, ?, ?, ?)`;
        const sid = this.extractSid(item);
        const name = this.extractName(item);
        const dataToSave = JSON.stringify({ ...item, id, cid, uid, sid, name });

        await this.database.execute(sql, [cid, uid, id, sid, name, dataToSave]);
    }

    public async saveAll(items: { id: string; data: CacheChannelView }[], cid: string, uid: string): Promise<void> {
        if (items.length === 0) return;
        const sql = `INSERT OR REPLACE INTO ${this.tableName} (cid, uid, id, sid, name, data) VALUES (?, ?, ?, ?, ?, ?)`;

        const commands: [string, any[]][] = items.map(item => {
            const id = item.id;
            const channelData = item.data;
            const sid = this.extractSid(channelData);
            const name = this.extractName(channelData);
            const dataToSave = JSON.stringify({ ...channelData, id, cid, uid, sid, name });

            return [sql, [cid, uid, id, sid, name, dataToSave]];
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

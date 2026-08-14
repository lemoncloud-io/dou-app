import type { CacheUserView, UserQueryOptions } from '@chatic/app-messages';
import type { ICacheDataSource } from './types';
import type { ISqliteDatabase } from '../../database';
import { fetchManyByIds } from './fetchManyByIds';
/**
 * 유저(User) 프로필 도메인 전용 데이터 소스
 */
export class UserDataSource implements ICacheDataSource<CacheUserView, UserQueryOptions> {
    constructor(
        private readonly database: ISqliteDatabase,
        private readonly tableName: string
    ) {}

    public async fetch(id: string, cid?: string, uid?: string): Promise<CacheUserView | null> {
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
        if (result.rows && result.rows.length > 0) return JSON.parse(result.rows[0].data as string) as CacheUserView;
        return null;
    }

    public async fetchMany(ids: string[], cid?: string, uid?: string): Promise<CacheUserView[]> {
        return fetchManyByIds<CacheUserView>(this.database, this.tableName, ids, cid, uid);
    }

    /**
     * 특정 클라우드 내의 전체 유저 목록을 조회합니다.
     */
    public async fetchAll(cid?: string, _query?: UserQueryOptions, uid?: string): Promise<CacheUserView[]> {
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

        const query =
            conditions.length > 0
                ? `SELECT data FROM ${this.tableName} WHERE ${conditions.join(' AND ')}`
                : `SELECT data FROM ${this.tableName}`;

        const result = await this.database.execute(query, params);
        return (result.rows || []).map((row: any) => JSON.parse(row.data as string) as CacheUserView);
    }

    public async save(id: string, item: CacheUserView, cid: string, uid: string): Promise<void> {
        const sql = `INSERT OR REPLACE INTO ${this.tableName} (cid, uid, id, data) VALUES (?, ?, ?, ?)`;
        const dataToSave = JSON.stringify({ ...item, id, cid, uid });
        await this.database.execute(sql, [cid, uid, id, dataToSave]);
    }

    public async saveAll(items: { id: string; data: CacheUserView }[], cid: string, uid: string): Promise<void> {
        if (items.length === 0) return;
        const sql = `INSERT OR REPLACE INTO ${this.tableName} (cid, uid, id, data) VALUES (?, ?, ?, ?)`;

        const commands: [string, any[]][] = items.map(item => [
            sql,
            [cid, uid, item.id, JSON.stringify({ ...item.data, id: item.id, cid, uid })],
        ]);
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
        const query =
            conditions.length > 0
                ? `DELETE FROM ${this.tableName} WHERE ${conditions.join(' AND ')}`
                : `DELETE FROM ${this.tableName}`;
        await this.database.execute(query, params);
    }
}

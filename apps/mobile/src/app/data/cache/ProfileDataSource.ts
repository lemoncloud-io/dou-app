import type { CacheProfileView, ProfileQueryOptions } from '@chatic/app-messages';
import type { ICacheDataSource } from './types';
import type { ISqliteDatabase } from '../../database';
/**
 * 사이트(플레이스) 표시 프로필(Profile) 도메인 전용 데이터 소스
 *
 * Profile rows are keyed by the web layer as `${sid}@${uid}`, but native treats
 * that value as an opaque `id` and partitions solely by (cid, uid) like every
 * other domain. The web `ProfileLocalDataSourceV2` applies the `sid` filter in
 * memory after loadAll, so `fetchAll` here intentionally ignores the query.
 */
export class ProfileDataSource implements ICacheDataSource<CacheProfileView, ProfileQueryOptions> {
    constructor(
        private readonly database: ISqliteDatabase,
        private readonly tableName: string
    ) {}

    public async fetch(id: string, cid?: string, uid?: string): Promise<CacheProfileView | null> {
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
        if (result.rows && result.rows.length > 0) return JSON.parse(result.rows[0].data as string) as CacheProfileView;
        return null;
    }

    /**
     * 특정 클라우드/사용자 스코프의 전체 프로필 목록을 조회합니다.
     * `sid` scoping is delegated to the web layer, so the query arg is unused.
     */
    public async fetchAll(cid?: string, _query?: ProfileQueryOptions, uid?: string): Promise<CacheProfileView[]> {
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
        return (result.rows || []).map((row: any) => JSON.parse(row.data as string) as CacheProfileView);
    }

    public async save(id: string, item: CacheProfileView, cid: string, uid: string): Promise<void> {
        const sql = `INSERT OR REPLACE INTO ${this.tableName} (cid, uid, id, data) VALUES (?, ?, ?, ?)`;
        const dataToSave = JSON.stringify({ ...item, id, cid, uid });
        await this.database.execute(sql, [cid, uid, id, dataToSave]);
    }

    public async saveAll(items: { id: string; data: CacheProfileView }[], cid: string, uid: string): Promise<void> {
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

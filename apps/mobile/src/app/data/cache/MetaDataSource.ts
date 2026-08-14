import type { CacheMetaView, MetaQueryOptions } from '@chatic/app-messages';
import type { ICacheDataSource } from './types';
import type { ISqliteDatabase } from '../../database';
import { fetchManyByIds } from './fetchManyByIds';
/**
 * 동기화 커서 등 메타(Meta) 도메인 전용 데이터 소스
 *
 * The web layer only reads/writes single rows (`getSyncedAt`/`setSyncedAt` →
 * load/save), where `id` is the cursor kind (e.g. 'channel-sync') scoped by
 * (cid, uid). The full CRUD surface is still implemented for parity with the
 * other domains and to service bulk clears from the bridge.
 */
export class MetaDataSource implements ICacheDataSource<CacheMetaView, MetaQueryOptions> {
    constructor(
        private readonly database: ISqliteDatabase,
        private readonly tableName: string
    ) {}

    public async fetch(id: string, cid?: string, uid?: string): Promise<CacheMetaView | null> {
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
        if (result.rows && result.rows.length > 0) return JSON.parse(result.rows[0].data as string) as CacheMetaView;
        return null;
    }

    public async fetchMany(ids: string[], cid?: string, uid?: string): Promise<CacheMetaView[]> {
        return fetchManyByIds<CacheMetaView>(this.database, this.tableName, ids, cid, uid);
    }

    /**
     * 특정 클라우드/사용자 스코프의 전체 메타 목록을 조회합니다.
     * Meta has no extra filter beyond cid/uid, so the query arg is unused.
     */
    public async fetchAll(cid?: string, _query?: MetaQueryOptions, uid?: string): Promise<CacheMetaView[]> {
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
        return (result.rows || []).map((row: any) => JSON.parse(row.data as string) as CacheMetaView);
    }

    public async save(id: string, item: CacheMetaView, cid: string, uid: string): Promise<void> {
        const sql = `INSERT OR REPLACE INTO ${this.tableName} (cid, uid, id, data) VALUES (?, ?, ?, ?)`;
        const dataToSave = JSON.stringify({ ...item, id, cid, uid });
        await this.database.execute(sql, [cid, uid, id, dataToSave]);
    }

    public async saveAll(items: { id: string; data: CacheMetaView }[], cid: string, uid: string): Promise<void> {
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

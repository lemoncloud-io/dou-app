import type { CacheInviteView, InviteQueryOptions } from '@chatic/app-messages';
import type { ICacheDataSource } from './types';
import type { ISqliteDatabase } from '../../database';
import { fetchManyByIds } from './fetchManyByIds';

/**
 * 발신자의 relay 1:1 초대 카드(ADR-0052) 도메인 전용 데이터 소스.
 *
 * 다른 도메인과 같은 표준 (cid, uid, id, data) blob 스키마다. 자격증명 필드(code, deeplink)를
 * 걸러내는 책임은 이 클래스가 아니라 웹 레이어의 허용 목록 매퍼(`toCacheInviteView`)에 있다 —
 * 여기 도착하는 시점에는 이미 그 필드들이 없다.
 */
export class InviteDataSource implements ICacheDataSource<CacheInviteView, InviteQueryOptions> {
    constructor(
        private readonly database: ISqliteDatabase,
        private readonly tableName: string
    ) {}

    public async fetch(id: string, cid?: string, uid?: string): Promise<CacheInviteView | null> {
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
        if (result.rows && result.rows.length > 0) return JSON.parse(result.rows[0].data as string) as CacheInviteView;
        return null;
    }

    public async fetchMany(ids: string[], cid?: string, uid?: string): Promise<CacheInviteView[]> {
        return fetchManyByIds<CacheInviteView>(this.database, this.tableName, ids, cid, uid);
    }

    /**
     * 특정 클라우드/사용자 스코프의 전체 초대 목록을 조회합니다.
     * Invite has no extra filter beyond cid/uid, so the query arg is unused.
     */
    public async fetchAll(cid?: string, _query?: InviteQueryOptions, uid?: string): Promise<CacheInviteView[]> {
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
        return (result.rows || []).map((row: any) => JSON.parse(row.data as string) as CacheInviteView);
    }

    public async save(id: string, item: CacheInviteView, cid: string, uid: string): Promise<void> {
        const sql = `INSERT OR REPLACE INTO ${this.tableName} (cid, uid, id, data) VALUES (?, ?, ?, ?)`;
        const dataToSave = JSON.stringify({ ...item, id, cid, uid });
        await this.database.execute(sql, [cid, uid, id, dataToSave]);
    }

    public async saveAll(items: { id: string; data: CacheInviteView }[], cid: string, uid: string): Promise<void> {
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

import type { CacheUserView, UserQueryOptions } from '@chatic/app-messages';
import type { ICacheDataSource } from './types';
import { TABLES } from '../../database';
import { database } from '../../services';

/**
 * 유저(User) 프로필 도메인 전용 데이터 소스
 */
export class UserDataSource implements ICacheDataSource<CacheUserView, UserQueryOptions> {
    public async fetch(id: string, cid?: string, uid?: string): Promise<CacheUserView | null> {
        let query = `SELECT data FROM ${TABLES.USERS} WHERE id = ?`;
        const params: (string | number)[] = [id];
        if (cid) {
            query += ` AND cid = ?`;
            params.push(cid);
        }
        if (uid) {
            query += ` AND uid = ?`;
            params.push(uid);
        }

        const result = await database.execute(query, params);
        if (result.rows && result.rows.length > 0) return JSON.parse(result.rows[0].data as string) as CacheUserView;
        return null;
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
                ? `SELECT data FROM ${TABLES.USERS} WHERE ${conditions.join(' AND ')}`
                : `SELECT data FROM ${TABLES.USERS}`;

        const result = await database.execute(query, params);
        return (result.rows || []).map((row: any) => JSON.parse(row.data as string) as CacheUserView);
    }

    public async save(id: string, item: CacheUserView, cid: string, uid: string): Promise<void> {
        const sql = `INSERT OR REPLACE INTO ${TABLES.USERS} (cid, uid, id, data) VALUES (?, ?, ?, ?)`;
        const dataToSave = JSON.stringify({ ...item, id, cid, uid });
        await database.execute(sql, [cid, uid, id, dataToSave]);
    }

    public async saveAll(items: { id: string; data: CacheUserView }[], cid: string, uid: string): Promise<void> {
        if (items.length === 0) return;
        const sql = `INSERT OR REPLACE INTO ${TABLES.USERS} (cid, uid, id, data) VALUES (?, ?, ?, ?)`;

        const commands: [string, any[]][] = items.map(item => [
            sql,
            [cid, uid, item.id, JSON.stringify({ ...item.data, id: item.id, cid, uid })],
        ]);
        await database.executeBatch(commands);
    }

    public async remove(id: string, cid: string, uid: string): Promise<void> {
        await database.execute(`DELETE FROM ${TABLES.USERS} WHERE id = ? AND cid = ? AND uid = ?`, [id, cid, uid]);
    }

    public async removeAll(ids: string[], cid: string, uid: string): Promise<void> {
        if (ids.length === 0) return;
        const sql = `DELETE FROM ${TABLES.USERS} WHERE id = ? AND cid = ? AND uid = ?`;
        await database.executeBatch(ids.map(id => [sql, [id, cid, uid]]));
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
                ? `DELETE FROM ${TABLES.USERS} WHERE ${conditions.join(' AND ')}`
                : `DELETE FROM ${TABLES.USERS}`;
        await database.execute(query, params);
    }
}

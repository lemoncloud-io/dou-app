import type { CacheCloudView, InviteCloudQueryOptions } from '@chatic/app-messages';
import type { ICacheDataSource } from './types';
import type { ISqliteDatabase } from '../../database';
import { fetchManyByIds } from './fetchManyByIds';

/**
 * Data source specific to the Invite Cloud domain.
 * Since this table holds system-wide (global) data, unlike other domains it does not run data
 * isolation queries scoped by cid (cloud ID).
 * (The _cid parameter is accepted only to satisfy the interface contract, and is ignored.)
 */
export class InviteCloudDataSource implements ICacheDataSource<CacheCloudView, InviteCloudQueryOptions> {
    constructor(
        private readonly database: ISqliteDatabase,
        private readonly tableName: string
    ) {}

    public async fetch(id: string, _cid?: string, _uid?: string): Promise<CacheCloudView | null> {
        const result = await this.database.execute(`SELECT data FROM ${this.tableName} WHERE id = ?`, [id]);
        if (result.rows && result.rows.length > 0) return JSON.parse(result.rows[0].data as string) as CacheCloudView;
        return null;
    }

    public async fetchMany(ids: string[], _cid?: string, _uid?: string): Promise<CacheCloudView[]> {
        // Since this is a global table, cid/uid are not added as conditions — same rule as `fetch`.
        return fetchManyByIds<CacheCloudView>(this.database, this.tableName, ids);
    }

    public async fetchAll(_cid?: string, _query?: InviteCloudQueryOptions, _uid?: string): Promise<CacheCloudView[]> {
        const result = await this.database.execute(`SELECT data FROM ${this.tableName}`);
        return (result.rows || []).reduce<CacheCloudView[]>((acc: CacheCloudView[], row: any) => {
            try {
                acc.push(JSON.parse(row.data as string) as CacheCloudView);
            } catch {
                return acc;
            }
            return acc;
        }, []);
    }

    public async save(id: string, item: CacheCloudView, _cid: string, _uid: string): Promise<void> {
        await this.database.execute(`INSERT OR REPLACE INTO ${this.tableName} (id, data) VALUES (?, ?)`, [
            id,
            JSON.stringify({ ...item, id }),
        ]);
    }

    public async saveAll(items: { id: string; data: CacheCloudView }[], _cid: string, _uid: string): Promise<void> {
        if (items.length === 0) return;
        const sql = `INSERT OR REPLACE INTO ${this.tableName} (id, data) VALUES (?, ?)`;
        const commands: [string, any[]][] = items.map(item => [
            sql,
            [item.id, JSON.stringify({ ...item.data, id: item.id })],
        ]);
        await this.database.executeBatch(commands);
    }

    public async remove(id: string, _cid: string, _uid: string): Promise<void> {
        await this.database.execute(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
    }

    public async removeAll(ids: string[], _cid: string, _uid: string): Promise<void> {
        if (ids.length === 0) return;
        await this.database.executeBatch(ids.map(id => [`DELETE FROM ${this.tableName} WHERE id = ?`, [id]]));
    }

    public async clear(_cid?: string, _uid?: string): Promise<void> {
        await this.database.execute(`DELETE FROM ${this.tableName}`);
    }
}

import type { CacheCloudView, InviteCloudQueryOptions } from '@chatic/app-messages';
import type { ICacheDataSource } from './types';
import type { IDatabaseService } from '../../database/sqlite';

/**
 * 초대 클라우드(Invite Cloud) 도메인 전용 데이터 소스입니다.
 * 이 테이블은 시스템 전역(Global) 데이터를 보관하므로, 다른 도메인과 달리 cid(클라우드 ID)를 통한 데이터 격리 쿼리를 수행하지 않습니다.
 * (파라미터로 넘어온 _cid는 인터페이스 규격을 맞추기 위한 것이며 무시됩니다)
 */
export class InviteCloudDataSource implements ICacheDataSource<CacheCloudView, InviteCloudQueryOptions> {
    constructor(
        private readonly database: IDatabaseService,
        private readonly tableName: string
    ) {}

    public async fetch(id: string, _cid?: string, _uid?: string): Promise<CacheCloudView | null> {
        const result = await this.database.execute(`SELECT data FROM ${this.tableName} WHERE id = ?`, [id]);
        if (result.rows && result.rows.length > 0) return JSON.parse(result.rows[0].data as string) as CacheCloudView;
        return null;
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

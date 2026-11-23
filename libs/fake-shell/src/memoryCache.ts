import type { CacheType, OnSaveAllCacheDataPayload, OnSaveCacheDataPayload } from '@chatic/bridge-messages';

import type { ShellHandlerTable } from './handlerTable';

type Row = Record<string, unknown> & { id: string };

interface SaveReply {
    type: CacheType;
    cid: string;
    uid: string;
    id: string | null;
    success: boolean;
}
interface SaveAllReply {
    type: CacheType;
    cid: string;
    uid: string;
    ids: string[];
    success: boolean;
    query?: unknown;
}

const QUERY_FILTERS: Partial<Record<CacheType, { exact: string[]; keyword?: string }>> = {
    channel: { exact: ['sid'], keyword: 'name' },
    chat: { exact: ['channelId'], keyword: 'content' },
    join: { exact: ['channelId', 'userId'] },
    site: { exact: [], keyword: 'name' },
};

export const FAKE_SHELL_CACHE_TYPES: CacheType[] = [
    'chat',
    'channel',
    'join',
    'site',
    'user',
    'invitecloud',
    'profile',
    'meta',
    'invite',
];

export class MemoryCache {
    private readonly tables = new Map<string, Map<string, Row>>();

    private table(type: string, cid: string, uid: string): Map<string, Row> {
        const key = `${type}|${cid}|${uid}`;
        let table = this.tables.get(key);
        if (!table) {
            table = new Map();
            this.tables.set(key, table);
        }
        return table;
    }

    seed(type: CacheType, scope: { cid: string; uid: string }, rows: Row[]): void {
        const table = this.table(type, scope.cid, scope.uid);
        for (const row of rows) table.set(row.id, row);
    }

    rows(type: CacheType, scope: { cid: string; uid: string }): Row[] {
        return [...this.table(type, scope.cid, scope.uid).values()];
    }

    entries(type: CacheType): Array<{ cid: string; uid: string; row: Row }> {
        const prefix = `${type}|`;
        const found: Array<{ cid: string; uid: string; row: Row }> = [];
        for (const [key, table] of this.tables) {
            if (!key.startsWith(prefix)) continue;
            const [, cid, uid] = key.split('|');
            for (const row of table.values()) found.push({ cid, uid, row });
        }
        return found;
    }

    clear(): void {
        this.tables.clear();
    }

    private query(type: string, cid: string, uid: string, query: Record<string, unknown> = {}): Row[] {
        let rows = [...this.table(type, cid, uid).values()];
        const filters = QUERY_FILTERS[type as CacheType] ?? { exact: [] };
        for (const field of filters.exact) {
            const wanted = query[field];
            if (typeof wanted === 'string' && wanted) rows = rows.filter(row => row[field] === wanted);
        }
        const keyword = query['keyword'];
        if (filters.keyword && typeof keyword === 'string' && keyword) {
            const field = filters.keyword;
            rows = rows.filter(row => String(row[field] ?? '').includes(keyword));
        }
        if (type !== 'chat') return rows;

        const chatNo = (row: Row) => Number(row['chatNo'] ?? 0);
        const cursorNo = query['cursorNo'];
        if (typeof cursorNo === 'number') rows = rows.filter(row => chatNo(row) < cursorNo);
        const ascending = query['sort'] === 'asc';
        rows.sort((a, b) => (ascending ? chatNo(a) - chatNo(b) : chatNo(b) - chatNo(a)));
        const limit = query['limit'];
        return typeof limit === 'number' ? rows.slice(0, limit) : rows;
    }

    handlers(): ShellHandlerTable {
        return {
            FetchCacheData: data => ({
                ...data,
                item: (this.table(data.type, data.cid, data.uid).get(data.id) ?? null) as never,
            }),
            FetchManyCacheData: data => {
                const table = this.table(data.type, data.cid, data.uid);
                const items = data.ids.flatMap(id => (table.has(id) ? [table.get(id) as Row] : []));
                return { ...data, items: items as never };
            },
            FetchAllCacheData: data => ({
                ...data,
                items: this.query(data.type, data.cid, data.uid, data.query as Record<string, unknown>) as never,
            }),
            SaveCacheData: data => {
                this.table(data.type, data.cid, data.uid).set(data.id, { ...(data.item as Row), id: data.id });
                const reply: SaveReply = { type: data.type, cid: data.cid, uid: data.uid, id: data.id, success: true };
                return reply as OnSaveCacheDataPayload;
            },
            SaveAllCacheData: data => {
                const table = this.table(data.type, data.cid, data.uid);
                const ids = (data.items as Row[]).map(item => {
                    table.set(item.id, item);
                    return item.id;
                });
                const reply: SaveAllReply = {
                    type: data.type,
                    cid: data.cid,
                    uid: data.uid,
                    ids,
                    success: true,
                    query: data.query,
                };
                return reply as OnSaveAllCacheDataPayload;
            },
            DeleteCacheData: data => {
                const deleted = this.table(data.type, data.cid, data.uid).delete(data.id);
                return { type: data.type, cid: data.cid, uid: data.uid, id: deleted ? data.id : null, success: true };
            },
            DeleteAllCacheData: data => {
                const table = this.table(data.type, data.cid, data.uid);
                const ids = data.ids.filter(id => table.delete(id));
                return { type: data.type, cid: data.cid, uid: data.uid, ids, success: true };
            },
            ClearCacheData: data => {
                this.table(data.type, data.cid, data.uid).clear();
                return { type: data.type, cid: data.cid, uid: data.uid, success: true };
            },
            ClearCacheDataByChannel: data => {
                const table = this.table(data.type, data.cid, data.uid);
                for (const [id, row] of table) if (row['channelId'] === data.channelId) table.delete(id);
                return { type: data.type, cid: data.cid, uid: data.uid, channelId: data.channelId, success: true };
            },
        };
    }
}

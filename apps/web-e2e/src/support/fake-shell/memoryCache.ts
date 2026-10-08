import type { CacheType, OnSaveAllCacheDataPayload, OnSaveCacheDataPayload } from '@chatic/app-messages';

import type { ShellHandlerTable } from './handlerTable';

type Row = Record<string, unknown> & { id: string };

/**
 * The save replies, not distributed over the cache types. Building a reply against these checks every
 * field; only the last step, to the distributed contract type, is an assertion.
 */
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

/** Per domain, what its SQLite data source filters on: exact fields, and the one `keyword` searches. */
const QUERY_FILTERS: Partial<Record<CacheType, { exact: string[]; keyword?: string }>> = {
    channel: { exact: ['sid'], keyword: 'name' },
    chat: { exact: ['channelId'], keyword: 'content' },
    join: { exact: ['channelId', 'userId'] },
    site: { exact: [], keyword: 'name' },
    // Profiles are not filtered by place here: the app's data source leaves that to the web.
};

/** The handshake's cache report. Every type the app persists, so the web stores nothing of its own. */
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

/**
 * The shell's local cache, in memory.
 *
 * Inside the app the web keeps its cache in the shell's SQLite (`FetchCacheData`, `SaveCacheData` and
 * their siblings) — not in IndexedDB — for every domain an installed app has ever stored, so a fake
 * shell that does not answer them leaves the home screen waiting on reads that fail. This answers them
 * the way `CacheCrudService` does, with the part of its query semantics the web relies on: a row is
 * scoped by cloud and user, each domain filters on the fields its SQLite data source filters on
 * (`QUERY_FILTERS`), and chat lists sort by `chatNo` (newest first unless asked) and page below
 * `cursorNo`. Left out: the columns a real save derives from the row (a chat's `channelId`, `chatNo`,
 * `createdAt` are read back from the row itself here), and the per-channel preview read
 * (`FetchLastChatsData`), which answers `NOT_FOUND` — the web then reads a window per channel, as it
 * does inside an older app.
 */
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

    /** Seeds rows as if a previous run of the app had saved them. */
    seed(type: CacheType, scope: { cid: string; uid: string }, rows: Row[]): void {
        const table = this.table(type, scope.cid, scope.uid);
        for (const row of rows) table.set(row.id, row);
    }

    rows(type: CacheType, scope: { cid: string; uid: string }): Row[] {
        return [...this.table(type, scope.cid, scope.uid).values()];
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

    /** The cache messages, answered from this store. */
    handlers(): ShellHandlerTable {
        // The payloads are unions distributed over every cache type, which no single implementation
        // narrows. The casts below are on row-valued fields, or on a reply already built against a
        // checked shape (`SaveReply`) — never on a whole reply that nothing checked.
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

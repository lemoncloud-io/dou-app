import type { CacheModelOf, CacheQueryOf, CacheType, ChatQueryOptions } from '@chatic/bridge-messages';
import type {
    CacheStorage,
    DataContextProvider,
    GlobalCacheContext,
    GlobalCacheSearchResult,
    ICacheMetricsSource,
    IGlobalCacheSearchSource,
} from '@chatic/data';
import { resolveScopedContext, withCacheMeta } from '@chatic/data';
import type { CachePort } from '@chatic/ports';

export const MEMORY_DB_ROUTE = 'memory';

const DEFAULT_CHAT_PAGE = 20;
const UNSENT_CHAT_NO = 0;

interface ChatRow {
    id?: string;
    channelId?: string;
    chatNo?: number;
}

const chatNoOf = (row: ChatRow): number => row.chatNo ?? UNSENT_CHAT_NO;

const queryChatRows = <Row extends ChatRow>(rows: readonly Row[], options?: ChatQueryOptions): Row[] => {
    if (!options?.channelId) return [...rows];
    const { channelId, cursorNo } = options;
    const limit = options.limit || DEFAULT_CHAT_PAGE;
    const newestFirst = rows.filter(row => row.channelId === channelId).sort((a, b) => chatNoOf(b) - chatNoOf(a));
    const page = (cursorNo === undefined ? newestFirst : newestFirst.filter(row => chatNoOf(row) < cursorNo)).slice(
        0,
        limit
    );
    if (!options.includeUnsent || cursorNo !== undefined) return page;
    const seen = new Set(page.map(row => row.id));
    const unsent = newestFirst.filter(row => chatNoOf(row) === UNSENT_CHAT_NO).slice(0, limit);
    return [...page, ...unsent.filter(row => !seen.has(row.id))];
};

type Rows = Map<string, string>;

class MemoryTable<TType extends CacheType> implements CacheStorage<TType> {
    constructor(
        private readonly tables: Map<string, Rows>,
        private readonly type: TType,
        private readonly contextProvider: DataContextProvider
    ) {}

    private rows(): Rows | null {
        const scope = resolveScopedContext(this.type, this.contextProvider);
        if (!scope) return null;
        const key = `${this.type}:${scope.cid}:${scope.uid}`;
        let rows = this.tables.get(key);
        if (!rows) {
            rows = new Map();
            this.tables.set(key, rows);
        }
        return rows;
    }

    private put(rows: Rows, id: string, item: CacheModelOf<TType>): void {
        rows.set(id, JSON.stringify(withCacheMeta(this.type, item)));
    }

    private read(raw: string | undefined): CacheModelOf<TType> | null {
        return raw === undefined ? null : (JSON.parse(raw) as CacheModelOf<TType>);
    }

    async save(id: string, item: CacheModelOf<TType>): Promise<CacheModelOf<TType>> {
        const rows = this.rows();
        if (rows) this.put(rows, id, item);
        return item;
    }

    async saveAll(items: CacheModelOf<TType>[]): Promise<CacheModelOf<TType>[]> {
        const rows = this.rows();
        if (!rows) return items;
        for (const item of items) {
            const id = (item as { id?: string }).id;
            if (id) this.put(rows, id, item);
        }
        return items;
    }

    async load(id: string): Promise<CacheModelOf<TType> | null> {
        return this.read(this.rows()?.get(id));
    }

    async loadMany(ids: string[]): Promise<CacheModelOf<TType>[]> {
        const rows = this.rows();
        if (!rows) return [];
        return ids.map(id => this.read(rows.get(id))).filter((item): item is CacheModelOf<TType> => item !== null);
    }

    async loadAll(options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]> {
        const rows = this.rows();
        if (!rows) return [];
        const all = [...rows.values()].map(raw => JSON.parse(raw) as CacheModelOf<TType>);
        if (this.type !== 'chat') return all;
        return queryChatRows(all as ChatRow[], options as ChatQueryOptions | undefined) as CacheModelOf<TType>[];
    }

    async delete(id: string): Promise<void> {
        this.rows()?.delete(id);
    }

    async deleteAll(ids: string[]): Promise<void> {
        const rows = this.rows();
        if (!rows) return;
        for (const id of ids) rows.delete(id);
    }

    async clearAll(): Promise<void> {
        this.rows()?.clear();
    }

    async clearByChannelId(channelId: string): Promise<void> {
        const rows = this.rows();
        if (!rows) return;
        for (const [id, raw] of rows) {
            if ((JSON.parse(raw) as { channelId?: string }).channelId === channelId) rows.delete(id);
        }
    }
}

const emptySearch: IGlobalCacheSearchSource = {
    search: async (): Promise<GlobalCacheSearchResult> => ({ channels: [], sites: [], chats: [] }),
    resolveContext: async (): Promise<GlobalCacheContext> => ({
        channelsByRef: {},
        sitesByRef: {},
        joinsByRef: {},
        lastChatsByRef: {},
    }),
};

const noMetrics: ICacheMetricsSource = {
    read: () => ({ totalOps: 0, operations: {} }),
    reset: () => undefined,
};

export const memoryDbPorts = (): CachePort => {
    const tables = new Map<string, Rows>();
    return {
        route: () => MEMORY_DB_ROUTE,
        storage: <TType extends CacheType>(
            type: TType,
            route: string,
            contextProvider: DataContextProvider
        ): CacheStorage<TType> => {
            if (route !== MEMORY_DB_ROUTE) {
                throw new Error(`[db-memory] unknown cache route '${route}' for '${type}'`);
            }
            return new MemoryTable(tables, type, contextProvider);
        },
        routed: () => undefined,
        globalSearch: () => emptySearch,
        metrics: () => noMetrics,
    };
};

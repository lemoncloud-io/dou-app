import type { CacheChannelView, CacheChatView, CacheJoinView, CacheSiteView, CacheType } from '@chatic/bridge-messages';
import type {
    GlobalCacheContext,
    GlobalCacheContextQuery,
    GlobalCacheRef,
    GlobalCacheSearchQuery,
    GlobalCacheSearchResult,
    DbSearchSource,
    IndexedDbConnection,
    IndexedDbRow,
} from '@chatic/data';
import { globalCacheRefKey } from '@chatic/data';
import { CHAT_PAGINATION_INDEX, TYPE_CID_UID_INDEX } from './IndexedDBDatabase';

type SearchableType = 'channel' | 'site' | 'chat';

const includesKeyword = (value: string | undefined, keyword: string): boolean =>
    typeof value === 'string' && value.toLowerCase().includes(keyword);

const dedupeRefs = (refs: GlobalCacheRef[]): GlobalCacheRef[] => {
    const seen = new Map<string, GlobalCacheRef>();
    refs.forEach(ref => {
        if (!ref.cid || !ref.channelId) return;
        seen.set(globalCacheRefKey(ref.cid, ref.channelId), ref);
    });
    return [...seen.values()];
};

export class IndexedDbGlobalSearchSource implements DbSearchSource {
    constructor(private readonly db: IndexedDbConnection) {}

    async search(keyword: string, query: GlobalCacheSearchQuery): Promise<GlobalCacheSearchResult> {
        const trimmed = keyword.trim().toLowerCase();
        if (!trimmed) {
            return { channels: [], sites: [], chats: [] };
        }

        const [channelRows, siteRows, chatRows] = await Promise.all([
            this.scan<'channel'>('channel', query),
            this.scan<'site'>('site', query),
            this.scan<'chat'>('chat', query),
        ]);

        return {
            channels: channelRows
                .map(row => row.data as CacheChannelView)
                .filter(item => includesKeyword(item.name, trimmed)),
            sites: siteRows.map(row => row.data as CacheSiteView).filter(item => includesKeyword(item.name, trimmed)),
            chats: chatRows
                .map(row => row.data as CacheChatView)
                .filter(item => includesKeyword(item.content, trimmed)),
        };
    }

    async resolveContext(query: GlobalCacheContextQuery): Promise<GlobalCacheContext> {
        const context: GlobalCacheContext = {
            channelsByRef: {},
            sitesByRef: {},
            joinsByRef: {},
            lastChatsByRef: {},
        };

        const cids = [...new Set(query.cids)];
        const refs = dedupeRefs(query.channelRefs);
        if (cids.length === 0 && refs.length === 0) return context;

        await Promise.all(
            cids.map(async cid => {
                const [channels, sites, joins] = await Promise.all([
                    this.loadPartition<'channel'>('channel', cid, query.uid),
                    this.loadPartition<'site'>('site', cid, query.uid),
                    this.loadPartition<'join'>('join', cid, query.uid),
                ]);

                channels.forEach(row => {
                    context.channelsByRef[globalCacheRefKey(cid, row.id)] = row.data as CacheChannelView;
                });
                sites.forEach(row => {
                    context.sitesByRef[globalCacheRefKey(cid, row.id)] = row.data as CacheSiteView;
                });
                joins.forEach(row => {
                    const join = row.data as CacheJoinView;
                    if (!join.channelId || join.userId !== query.uid) return;
                    context.joinsByRef[globalCacheRefKey(cid, join.channelId)] = join;
                });
            })
        );

        await Promise.all(
            refs.map(async ref => {
                const rows = await this.db.loadWithCursor<'chat'>({
                    indexName: CHAT_PAGINATION_INDEX,
                    range: IDBKeyRange.bound(
                        ['chat', ref.cid, query.uid, ref.channelId],
                        ['chat', ref.cid, query.uid, ref.channelId, []]
                    ),
                    direction: 'prev',
                    limit: 1,
                    filter: row => (row.chat_no ?? 0) > 0,
                });
                const newest = rows[0];
                if (newest) {
                    context.lastChatsByRef[globalCacheRefKey(ref.cid, ref.channelId)] = newest.data as CacheChatView;
                }
            })
        );

        return context;
    }

    private async loadPartition<TType extends CacheType>(
        type: TType,
        cid: string,
        uid: string
    ): Promise<IndexedDbRow<TType>[]> {
        return this.db.loadAll<TType>(TYPE_CID_UID_INDEX, [type, cid, uid]);
    }

    private async scan<TType extends SearchableType>(
        type: TType,
        query: GlobalCacheSearchQuery
    ): Promise<IndexedDbRow<TType>[]> {
        const range = IDBKeyRange.bound([type], [type, []]);
        const rows = await this.db.loadAll<TType>(TYPE_CID_UID_INDEX, range);

        return rows.filter(row => row.uid === query.uid && (!query.cid || row.cid === query.cid));
    }
}

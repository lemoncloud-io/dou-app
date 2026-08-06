import type { CacheChannelView, CacheChatView, CacheJoinView, CacheSiteView, CacheType } from '@chatic/app-messages';
import type { IIndexedDB, IndexedDbRow } from '../databases';
import { CHAT_PAGINATION_INDEX, TYPE_CID_UID_INDEX } from '../databases';
import type {
    GlobalCacheContext,
    GlobalCacheContextQuery,
    GlobalCacheRef,
    GlobalCacheSearchQuery,
    GlobalCacheSearchResult,
    IGlobalCacheSearchSource,
} from './types';
import { globalCacheRefKey } from './types';

type SearchableType = 'channel' | 'site' | 'chat';

const includesKeyword = (value: string | undefined, keyword: string): boolean =>
    typeof value === 'string' && value.toLowerCase().includes(keyword);

/** One cursor read per channel, so the same channel referenced by many chat rows costs once. */
const dedupeRefs = (refs: GlobalCacheRef[]): GlobalCacheRef[] => {
    const seen = new Map<string, GlobalCacheRef>();
    refs.forEach(ref => {
        if (!ref.cid || !ref.channelId) return;
        seen.set(globalCacheRefKey(ref.cid, ref.channelId), ref);
    });
    return [...seen.values()];
};

/**
 * Cross-cloud reads over IndexedDB. `search` scans the `type_cid_uid` index with only `type` bound
 * (cid left open), so it reads every cached cloud partition in one pass instead of the
 * active-cid-only reads that repo `observeList`/`cacheReadList` perform.
 *
 * `cid`/`uid` scoping lives on the row (`IndexedDbRow`), not on the domain view stored in
 * `row.data` — the view types don't all carry `uid`, so filtering happens at the row level.
 */
export class IndexedDbGlobalSearchSource implements IGlobalCacheSearchSource {
    constructor(private readonly db: IIndexedDB) {}

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

    /**
     * Reads the rows a search result row needs around it. Unlike `search` these lookups are
     * addressed, so they use exact `[type, cid, uid]` index hits per cloud plus one reverse cursor
     * per channel — never a full-table scan.
     */
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

        // Per-cloud maps. `row.id` is the channelId / sid for these types.
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
                    if (!join.channelId) return;
                    context.joinsByRef[globalCacheRefKey(cid, join.channelId)] = join;
                });
            })
        );

        // Newest cached message per channel, via the chat pagination index read backwards. Unsent
        // rows (`chat_no: 0`) sort lowest so they normally lose on ordering alone; the filter is
        // what decides when a channel's ONLY cached row is unsent — a preview must never show a
        // message the server hasn't accepted.
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
        // Bound only on `type` (cid/uid left open) so every cloud partition is scanned.
        const range = IDBKeyRange.bound([type], [type, []]);
        const rows = await this.db.loadAll<TType>(TYPE_CID_UID_INDEX, range);

        return rows.filter(row => row.uid === query.uid && (!query.cid || row.cid === query.cid));
    }
}

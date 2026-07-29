import type { CacheChannelView, CacheChatView, CacheSiteView } from '@chatic/app-messages';
import type { IIndexedDB, IndexedDbRow } from '../databases';
import { TYPE_CID_UID_INDEX } from '../databases';
import type { GlobalCacheSearchQuery, GlobalCacheSearchResult, IGlobalCacheSearchSource } from './types';

type SearchableType = 'channel' | 'site' | 'chat';

const includesKeyword = (value: string | undefined, keyword: string): boolean =>
    typeof value === 'string' && value.toLowerCase().includes(keyword);

/**
 * Cross-cloud search over IndexedDB. Scans the `type_cid_uid` index with only `type` bound
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

import type { CacheChannelView, CacheChatView, CacheSiteView } from '@chatic/app-messages';

/**
 * Global cache search query. `uid` always scopes the search to the current user;
 * `cid` narrows to one cloud when set, otherwise every cached cloud partition is searched.
 */
export interface GlobalCacheSearchQuery {
    uid: string;
    cid?: string;
}

/**
 * Global cache search result, grouped by domain. `sites` holds place data — the 'site'
 * cache slot is shared by Place and Site (see PlaceLocalDataSourceV2.ts).
 */
export interface GlobalCacheSearchResult {
    channels: CacheChannelView[];
    sites: CacheSiteView[];
    chats: CacheChatView[];
}

/**
 * Cross-cloud keyword search over the local cache. Implementations must share the same
 * matching semantics (name/content substring, case-insensitive) across web (IndexedDB) and
 * native (SQLite via bridge) so callers see identical behavior regardless of platform.
 */
export interface IGlobalCacheSearchSource {
    search(keyword: string, query: GlobalCacheSearchQuery): Promise<GlobalCacheSearchResult>;
}

import type { CacheChannelView, CacheChatView, CacheJoinView, CacheSiteView } from '@chatic/app-messages';

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

/** A cached row addressed across clouds. `cid` is always explicit — never taken from context. */
export interface GlobalCacheRef {
    cid: string;
    channelId: string;
}

/**
 * What a search result row needs beyond the matched row itself: the owning place/channel names,
 * my read cursor (for the unread count) and the newest cached message.
 *
 * Repositories cannot answer this — `cacheRead` ignores the context override and `cacheReadList`
 * applies it to sid filtering only, so the existing override is a sid override, not a cid one
 * (ChannelLocalDataSourceV2.ts:39,53). Hence it lives on the search source, next to the only
 * other cross-cloud reader in the codebase.
 */
export interface GlobalCacheContextQuery {
    uid: string;
    /** Clouds appearing in the results — channel/place/join maps are read per cloud. */
    cids: string[];
    /** Channels needing their newest message: channel result rows + chat rows' owning channels. */
    channelRefs: GlobalCacheRef[];
}

/**
 * Context maps keyed by `${cid}:${id}` — id is a channelId (channels/joins/lastChats) or a sid
 * (sites). A reference absent from the cache is simply absent from the map; callers must render
 * the field as missing rather than substituting an empty string or a zero.
 */
export interface GlobalCacheContext {
    channelsByRef: Record<string, CacheChannelView>;
    sitesByRef: Record<string, CacheSiteView>;
    /** My join rows only (row-level uid is already the current user). Supplies `readNo`. */
    joinsByRef: Record<string, CacheJoinView>;
    lastChatsByRef: Record<string, CacheChatView>;
}

/** Composes the `${cid}:${id}` key used by every {@link GlobalCacheContext} map. */
export const globalCacheRefKey = (cid: string, id: string): string => `${cid}:${id}`;

/**
 * Cross-cloud reads over the local cache. Implementations must share the same semantics —
 * `search`'s matching (name/content substring, case-insensitive) and `resolveContext`'s maps —
 * across web (IndexedDB) and native (SQLite via bridge) so callers see identical behavior
 * regardless of platform. Both are read-only: neither ever writes to the cache.
 */
export interface IGlobalCacheSearchSource {
    search(keyword: string, query: GlobalCacheSearchQuery): Promise<GlobalCacheSearchResult>;
    resolveContext(query: GlobalCacheContextQuery): Promise<GlobalCacheContext>;
}

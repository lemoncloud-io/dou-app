import type { CacheChannelView, CacheChatView, CacheJoinView, CacheSiteView } from '@chatic/bridge-messages';

export interface GlobalCacheSearchQuery {
    uid: string;
    cid?: string;
}

export interface GlobalCacheSearchResult {
    channels: CacheChannelView[];
    sites: CacheSiteView[];
    chats: CacheChatView[];
}

export interface GlobalCacheRef {
    cid: string;
    channelId: string;
}

export interface GlobalCacheContextQuery {
    uid: string;
    cids: string[];
    channelRefs: GlobalCacheRef[];
}

export interface GlobalCacheContext {
    channelsByRef: Record<string, CacheChannelView>;
    sitesByRef: Record<string, CacheSiteView>;
    joinsByRef: Record<string, CacheJoinView>;
    lastChatsByRef: Record<string, CacheChatView>;
}

export const globalCacheRefKey = (cid: string, id: string): string => `${cid}:${id}`;

export interface IGlobalCacheSearchSource {
    search(keyword: string, query: GlobalCacheSearchQuery): Promise<GlobalCacheSearchResult>;
    resolveContext(query: GlobalCacheContextQuery): Promise<GlobalCacheContext>;
}

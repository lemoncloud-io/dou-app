import type {
    CacheChannelView,
    CacheChatView,
    CacheJoinView,
    CacheSiteView,
    OnFetchAllCacheDataPayload,
    OnSearchGlobalCacheDataPayload,
} from '@chatic/bridge-messages';
import type {
    GlobalCacheContext,
    GlobalCacheContextQuery,
    GlobalCacheRef,
    GlobalCacheSearchQuery,
    GlobalCacheSearchResult,
    IGlobalCacheSearchSource,
} from '@chatic/data';
import { globalCacheRefKey } from '@chatic/data';

import type { CacheBridgeClient } from '../native/cacheBridge';

type TaggedSearchItem =
    | (CacheChannelView & { _domain: 'channel' })
    | (CacheChatView & { _domain: 'chat' })
    | (CacheSiteView & { _domain: 'site' });

const dedupeRefs = (refs: GlobalCacheRef[]): GlobalCacheRef[] => {
    const seen = new Map<string, GlobalCacheRef>();
    refs.forEach(ref => {
        if (!ref.cid || !ref.channelId) return;
        seen.set(globalCacheRefKey(ref.cid, ref.channelId), ref);
    });
    return [...seen.values()];
};

export class NativeGlobalSearchSource implements IGlobalCacheSearchSource {
    constructor(private readonly bridge: CacheBridgeClient) {}

    async search(keyword: string, query: GlobalCacheSearchQuery): Promise<GlobalCacheSearchResult> {
        const trimmed = keyword.trim();
        if (!trimmed) {
            return { channels: [], sites: [], chats: [] };
        }

        const response = await this.bridge.request({
            type: 'SearchGlobalCacheData',
            data: { keyword: trimmed, cid: query.cid, uid: query.uid },
        });

        const { items } = response.data as OnSearchGlobalCacheDataPayload;
        const result: GlobalCacheSearchResult = { channels: [], sites: [], chats: [] };

        for (const item of (items ?? []) as TaggedSearchItem[]) {
            if (item._domain === 'channel') result.channels.push(item);
            else if (item._domain === 'site') result.sites.push(item);
            else if (item._domain === 'chat') result.chats.push(item);
        }

        return result;
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

        await Promise.all([
            ...cids.map(async cid => {
                const [channels, sites, joins] = await Promise.all([
                    this.fetchAll<CacheChannelView>('channel', cid, query.uid),
                    this.fetchAll<CacheSiteView>('site', cid, query.uid),
                    this.fetchAll<CacheJoinView>('join', cid, query.uid, { userId: query.uid }),
                ]);

                channels.forEach(channel => {
                    if (channel.id) context.channelsByRef[globalCacheRefKey(cid, channel.id)] = channel;
                });
                sites.forEach(site => {
                    if (site.id) context.sitesByRef[globalCacheRefKey(cid, site.id)] = site;
                });
                joins.forEach(join => {
                    if (!join.channelId || join.userId !== query.uid) return;
                    context.joinsByRef[globalCacheRefKey(cid, join.channelId)] = join;
                });
            }),
            ...refs.map(async ref => {
                const chats = await this.fetchAll<CacheChatView>('chat', ref.cid, query.uid, {
                    channelId: ref.channelId,
                    sort: 'desc',
                    limit: 1,
                });
                const newest = chats.find(chat => (chat.chatNo ?? 0) > 0);
                if (newest) context.lastChatsByRef[globalCacheRefKey(ref.cid, ref.channelId)] = newest;
            }),
        ]);

        return context;
    }

    private async fetchAll<TView>(
        type: 'channel' | 'site' | 'join' | 'chat',
        cid: string,
        uid: string,
        query?: Record<string, unknown>
    ): Promise<TView[]> {
        try {
            const response = await this.bridge.request({
                type: 'FetchAllCacheData',
                data: { type, cid, uid, query } as never,
            });
            const { items } = response.data as OnFetchAllCacheDataPayload;
            return (items ?? []) as TView[];
        } catch {
            return [];
        }
    }
}

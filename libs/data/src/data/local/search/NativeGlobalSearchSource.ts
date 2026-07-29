import type {
    CacheChannelView,
    CacheChatView,
    CacheSiteView,
    OnSearchGlobalCacheDataPayload,
} from '@chatic/app-messages';
import type { IWebBridgeClient } from '@chatic/bridges';
import type { GlobalCacheSearchQuery, GlobalCacheSearchResult, IGlobalCacheSearchSource } from './types';

/**
 * `_domain` is stamped onto every item by the native CacheSearchService
 * (apps/mobile/src/app/services/cache/CacheSearchService.ts:44-46) but isn't part of the
 * shared `OnSearchGlobalCacheDataPayload` type — it's a stable wire field the shared type
 * just doesn't declare. Modeled here so the client can classify results without guessing.
 */
type TaggedSearchItem =
    | (CacheChannelView & { _domain: 'channel' })
    | (CacheChatView & { _domain: 'chat' })
    | (CacheSiteView & { _domain: 'site' });

/**
 * Cross-cloud search delegated to the native app via the existing `SearchGlobalCacheData`
 * bridge message. The native side (CacheSearchService + SQLite LIKE, cid omitted = every
 * cloud) is already deployed — this class is purely a client for it, no native changes.
 */
export class NativeGlobalSearchSource implements IGlobalCacheSearchSource {
    constructor(private readonly bridge: IWebBridgeClient) {}

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
}

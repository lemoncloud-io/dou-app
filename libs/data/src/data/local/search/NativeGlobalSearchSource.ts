import type {
    CacheChannelView,
    CacheChatView,
    CacheJoinView,
    CacheProfileView,
    CacheSiteView,
    OnFetchAllCacheDataPayload,
    OnSearchGlobalCacheDataPayload,
} from '@chatic/app-messages';
import type { IWebBridgeClient } from '@chatic/bridges';
import type {
    GlobalCacheContext,
    GlobalCacheContextQuery,
    GlobalCacheRef,
    GlobalCacheSearchQuery,
    GlobalCacheSearchResult,
    IGlobalCacheSearchSource,
} from './types';
import { globalCacheProfileKey, globalCacheRefKey } from './types';

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

/** One request per channel, so a channel referenced by many chat rows is fetched once. */
const dedupeRefs = (refs: GlobalCacheRef[]): GlobalCacheRef[] => {
    const seen = new Map<string, GlobalCacheRef>();
    refs.forEach(ref => {
        if (!ref.cid || !ref.channelId) return;
        seen.set(globalCacheRefKey(ref.cid, ref.channelId), ref);
    });
    return [...seen.values()];
};

/**
 * Cross-cloud reads delegated to the native app over the existing cache bridge messages. The
 * native side (CacheSearchService + SQLite LIKE for `search`, the CRUD cache service for
 * `resolveContext`) is already deployed — this class is purely a client for it, no native changes,
 * so it works on app builds already in the field.
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

    /**
     * Reads a non-active cloud's rows by passing `cid` explicitly: the bridge handler forwards the
     * payload's cid straight to the cache service (useCrudCacheHandler.ts:13-32), which is what
     * makes a read outside the active cloud possible at all.
     *
     * Cost is `3 × clouds + channelRefs` round trips, issued in parallel — per cloud the whole
     * channel/site/join table (one request beats one-per-id), and per channel a single
     * newest-message row, which the SQLite side supports via `channel_id` + `ORDER BY chat_no DESC`
     * + `LIMIT` (apps/mobile ChatDataSource.ts:46-72).
     */
    async resolveContext(query: GlobalCacheContextQuery): Promise<GlobalCacheContext> {
        const context: GlobalCacheContext = {
            channelsByRef: {},
            sitesByRef: {},
            joinsByRef: {},
            lastChatsByRef: {},
            profilesByRef: {},
        };

        const cids = [...new Set(query.cids)];
        const refs = dedupeRefs(query.channelRefs);
        if (cids.length === 0 && refs.length === 0) return context;

        await Promise.all([
            ...cids.map(async cid => {
                const [channels, sites, joins, profiles] = await Promise.all([
                    this.fetchAll<CacheChannelView>('channel', cid, query.uid),
                    this.fetchAll<CacheSiteView>('site', cid, query.uid),
                    // `userId` narrows to MY join row in SQL (JoinDataSource.ts:49-52). The row's
                    // `uid` is only the cache owner — other members' joins live in my partition
                    // too (read receipts cache them), so filtering by uid alone would pick up a
                    // stranger's read cursor.
                    this.fetchAll<CacheJoinView>('join', cid, query.uid, { userId: query.uid }),
                    // Every member's display profile in this cloud — a chat row's place is only known
                    // after its channel resolves, so asking per member would cost a second pass.
                    this.fetchAll<CacheProfileView>('profile', cid, query.uid),
                ]);

                channels.forEach(channel => {
                    if (channel.id) context.channelsByRef[globalCacheRefKey(cid, channel.id)] = channel;
                });
                sites.forEach(site => {
                    if (site.id) context.sitesByRef[globalCacheRefKey(cid, site.id)] = site;
                });
                profiles.forEach(profile => {
                    // `userId` is the member; `uid` is the cache owner, which older rows reuse as the
                    // member id (ProfileLocalDataSourceV2.ts:44,63).
                    const memberId = profile.userId || profile.uid;
                    if (!profile.sid || !memberId) return;
                    context.profilesByRef[globalCacheProfileKey(cid, profile.sid, memberId)] = profile;
                });
                joins.forEach(join => {
                    // Belt-and-braces alongside the SQL filter, so both implementations enforce the
                    // same "my row only" rule rather than trusting one query parameter.
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
                // Unsent rows (`chatNo: 0`) are excluded here as on web: a preview must never show
                // a message the server hasn't accepted.
                const newest = chats.find(chat => (chat.chatNo ?? 0) > 0);
                if (newest) context.lastChatsByRef[globalCacheRefKey(ref.cid, ref.channelId)] = newest;
            }),
        ]);

        return context;
    }

    /**
     * A failed request contributes nothing instead of rejecting the whole resolve — a missing name
     * must degrade one row, not blank out the results the user is already looking at.
     */
    private async fetchAll<TView>(
        type: 'channel' | 'site' | 'join' | 'chat' | 'profile',
        cid: string,
        uid: string,
        query?: Record<string, unknown>
    ): Promise<TView[]> {
        try {
            const response = await this.bridge.request({
                type: 'FetchAllCacheData',
                // Double cast: the per-type discriminated payload union cannot be narrowed from a
                // runtime `type` value (the same reason NativeDBAdapter casts its payloads).
                data: { type, cid, uid, query } as never,
            });
            const { items } = response.data as OnFetchAllCacheDataPayload;
            return (items ?? []) as TView[];
        } catch {
            return [];
        }
    }
}

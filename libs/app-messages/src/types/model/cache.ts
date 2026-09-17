import type {
    ChannelView,
    ChatView,
    JoinView,
    ProfileDisplay,
    ProfileView,
    UserView,
} from '@lemoncloud/chatic-socials-api';
import type { CloudView, MyInviteView, MySiteView } from '@lemoncloud/chatic-backend-api';

/** Definition of cacheable domain types */
export type CacheType = 'channel' | 'chat' | 'user' | 'join' | 'site' | 'invitecloud' | 'profile' | 'meta' | 'invite';

/**
 * Per-domain cache contract version number (ADR-0053).
 *
 * The app declares the version it **implements**, and the web declares the version it
 * **requires**, each independently. If both sides imported the same constant, it would become
 * an identity rather than a negotiation, so here we share **only the type**, not the value.
 * Version numbers increase monotonically and are unrelated to the global SQLite schema number or
 * to when a domain was added.
 *
 * See libs/app-runtime/docs/data/cache-contract-versions.md for the full design.
 */
export type CacheDomainVersions = Partial<Record<CacheType, number>>;

/** Common metadata for paging and list handling */
export type PagingMeta = {
    page?: number; // Page number
    cursorNo?: number; // Cursor number
    limit?: number; // Items per page
    total?: number; // Total item count
    readNo?: number; // Number of the last message read
    took?: number;
};

/** Cache expiration/sync metadata */
export type CacheTtlMeta = {
    lastSyncedAt: number;
    expiresAt: number;
};

/** Common meta base for cache models */
export type CacheViewBase = {
    __cacheMeta?: CacheTtlMeta;
};

/** Common base fields for every cache message */
type CacheBasePayload<K extends CacheType> = {
    type: K; // Domain type
    cid: string; // Cloud ID
    uid: string; // User ID;
};

/*
 * Maps each CacheType to the data structure it actually holds.
 */
export type CacheModelMap = {
    channel: CacheChannelView;
    chat: CacheChatView;
    invitecloud: CacheCloudView;
    join: CacheJoinView;
    site: CacheSiteView;
    user: CacheUserView;
    profile: CacheProfileView;
    meta: CacheMetaView;
    invite: CacheInviteView;
};

export type CacheModelOf<TType extends CacheType> = CacheModelMap[TType];
export type CacheQueryOf<TType extends CacheType> = CacheQueryMap[TType];

/** Cloud/server info view */
export type CacheCloudView = CloudView &
    CacheViewBase & {
        id: string;
        name?: string;
        backend?: string;
        wss?: string;
        cid: string;
        /** Classifies a cloud as invited ('invited') vs. self-owned ('owner') */
        cloudType?: 'invited' | 'owner';
    };

/** Channel info view (includes Site ID and domain fields) */
export type CacheChannelView = ChannelView &
    CacheViewBase & {
        id: string;
        cid: string;
        sid: string;
        isNotificationEnabled: boolean;
        /**
         * Activity time used for sorting. **Optional — nothing currently populates this value.**
         *
         * It used to be declared required, but since no mapper or data source used it, including
         * `toDomainChannel` — that left `libs/data` failing to build (and that stale `dist` was
         * leaving phantom type errors in `apps/web`) — and having a mapper fill it in arbitrarily
         * isn't the answer either: the chat cache owns "when a channel last moved" (ADR-0057), so
         * `toDomainChannel` deliberately does not read `lastChat$` — folding a server summary in
         * here would give one channel two different answers to "when did it last move." Its only
         * reader (the desktop-web ChannelList) already reads
         * `lastChat?.createdAt ?? channel.lastActivityAt`, and `relativeTime` renders an empty
         * string when it receives `undefined`. The stored shape doesn't change, so there's no
         * reason to bump the cache contract version (ADR-0053) either.
         */
        lastActivityAt?: number;
    };

/** Chat message view (includes send status and domain fields) */
export type CacheChatView = ChatView &
    CacheViewBase & {
        id: string;
        cid: string;
        channelId: string;
        chatNo: number;
        isPending: boolean; // Narrowed: non-optional
        isFailed: boolean; // Narrowed: non-optional
        createdAtMs: number; // Added: timestamp
        updatedAtMs: number; // Added: timestamp
        tempId?: string;
    };

/** Site info view */
export type CacheSiteView = MySiteView &
    CacheViewBase & {
        id: string;
        cid: string;
        order: number; // Narrowed: non-optional
    };

export type CacheJoinView = JoinView &
    CacheViewBase & {
        id: string;
        cid: string;
        channelId: string;
        userId: string;
        joined: number;
        readNo: number;
        /**
         * Snapshot of `channel.metaNo` at the time of the read cursor (`chatNo`). The server sends
         * it in the join payload, but the published `JoinView` doesn't declare it yet, so it's
         * widened here. Used when computing unread counts based on user messages —
         * `(channel.chatNo - channel.metaNo) - (join.chatNo - join.metaNo)`.
         * Absent on rows written before the server started leaving this snapshot.
         */
        metaNo?: number;
    };

export type CacheUserView = UserView &
    CacheViewBase & {
        id: string;
        cid: string;
    };

/**
 * Key-value metadata view scoped to cid/uid, such as sync cursors.
 * `id` is the meta kind (e.g. 'channel-sync'), and the value holds the sync cursor (`syncedAt`).
 */
export type CacheMetaView = CacheViewBase & {
    id: string;
    cid: string;
    uid: string;
    syncedAt?: number;
    /**
     * Cache storage routing fingerprint at the time this cursor was saved (ADR-0053).
     *
     * The cursor points at a sync position in **another domain**, so if that domain moves to a
     * different store, a leftover cursor lies and says "already synced" — the new store is empty
     * but only deltas get fetched. If the fingerprint differs, the cursor is treated as invalid
     * and a full resync (`since=0`) is forced.
     */
    routing?: string;
};

/**
 * Cache view of a relay 1:1 invite card sent by the sender.
 *
 * `code` and `deeplink` are deliberately excluded — `code` is a credential, not an identifier, and
 * `deeplink` embeds it whole as `?code=<code>`. Leaving them out of this type is only a
 * compile-time contract; the actual enforcement happens in the allowlist mapper
 * (`toCacheInviteView`) right before saving.
 */
export type CacheInviteView = Omit<MyInviteView, 'code' | 'deeplink'> &
    CacheViewBase & {
        id: string;
        cid: string;
        uid: string;
        /** When this row was locally hidden (epoch ms). A display decision on this device, not server state. */
        dismissedAt?: number;
    };

/** Display profile view per place (site) */
export type CacheProfileView = ProfileView &
    Partial<ProfileDisplay> &
    CacheViewBase & {
        id: string;
        cid: string;
        sid: string; // Narrowed: non-optional
        uid: string;
        userId: string;
        updatedAtMs: number; // Added: update time
    };

/**
 * Defines which conditions (sort, filters, etc.) identify data during FetchAll/SaveAll.
 */
export type BaseQueryOptions = {
    cid?: string;
    uid?: string;
};

/** Query for listing channels */
export type ChannelQueryOptions = BaseQueryOptions & {
    sid?: string; // Filter channels within a specific site
    keyword?: string; // Search keyword
};

/** Query for listing chats */
export type ChatQueryOptions = BaseQueryOptions & {
    channelId?: string;
    sort?: 'asc' | 'desc';
    keyword?: string;
    limit?: number;
    cursorNo?: number;
    /**
     * Includes unsent rows (`chatNo: 0` — sending or failed) alongside the latest page.
     *
     * Defaults to false, in which case behavior is **exactly the same** as before this option
     * existed. It's opt-in because `apps/web` (mobile) runs through the same executor — only the
     * caller that turns it on sees a behavior change. See the comment on `ChatQueryExecutor` for
     * why this is needed.
     */
    includeUnsent?: boolean;
};

export type InviteCloudQueryOptions = BaseQueryOptions;

/** Query for join info */
export type JoinQueryOptions = BaseQueryOptions & {
    channelId?: string;
    userId?: string;
};

/** Query for user info */
export type UserQueryOptions = BaseQueryOptions;

/** Query for site info */
export type SiteQueryOptions = BaseQueryOptions & {
    keyword?: string; // Search keyword
};

/** Query for place profiles */
export type ProfileQueryOptions = BaseQueryOptions & {
    sid?: string; // Filter by a specific site/place
};

/** Meta query (scoped to cid/uid, no extra filters) */
export type MetaQueryOptions = BaseQueryOptions;

/** Invite query (scoped to cid/uid, no extra filters) */
export type InviteQueryOptions = BaseQueryOptions;

/** Mapping of query options per domain */
export type CacheQueryMap = {
    channel: ChannelQueryOptions;
    chat: ChatQueryOptions;
    user: UserQueryOptions;
    site: SiteQueryOptions;
    join: JoinQueryOptions;
    invitecloud: InviteCloudQueryOptions;
    profile: ProfileQueryOptions;
    meta: MetaQueryOptions;
    invite: InviteQueryOptions;
};

/** [Request] Fetch a single item by ID */
export type FetchCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string };
}[CacheType];

/** [Response] Returns a single item (item is null if not found) */
export type OnFetchCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string; item: CacheModelMap[K] | null };
}[CacheType];

/**
 * [Request] Fetch multiple items by a list of IDs.
 *
 * Produces the same result as sending `FetchCacheData` once per id, but in a single bridge
 * round trip. The cache layer's merge write (`cacheWriteMany`) has to read the existing row for
 * each item, and when that turned into N round trips, it became a real cost on native storage —
 * saving 50 chats meant 51 round trips. N in-process SQLite queries are cheap; round trips are
 * what's expensive, so only the round trips are collapsed.
 *
 * If the app doesn't know this message, the host rejects it with `NOT_FOUND` and the web falls
 * back to per-id fetches (`NativeDBAdapter.loadMany`) — since the web ships ahead of the app, this
 * fallback isn't optional, it's required.
 */
export type FetchManyCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { ids: string[] };
}[CacheType];

/**
 * [Response] Rows corresponding to the requested ids.
 *
 * IDs that don't exist aren't left as empty slots — they're simply omitted, so order and length
 * don't match the request. Since the caller re-indexes by id (`loadMany`), there's no reason to
 * send padded empty slots, and `null` entries would only add to the payload size.
 */
export type OnFetchManyCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { ids: string[]; items: CacheModelMap[K][] | null };
}[CacheType];

/**
 * [Request] Fetch a single latest preview per channel (chat only, ADR-0057).
 *
 * Instead of the home channel list reading a 30-row window per channel, this collapses the whole
 * list into a single round trip. Preview eligibility (excluding thread replies, reaction events,
 * system rows, and failed sends; including tombstones; preferring the latest unsent) is computed
 * by the app's SQL, but the web remains the final owner of that semantics — it re-validates the
 * returned rows and, if one fails, falls back to a windowed query for that channel only.
 *
 * If the app doesn't know this message, the host rejects it with `NOT_FOUND` and the web falls
 * back to a per-channel windowed fetch (`NativeDBAdapter.loadLastPerChannel`) — since the web
 * ships ahead of the app, this fallback isn't optional, it's required.
 */
export type FetchLastChatsDataPayload = CacheBasePayload<'chat'> & { channelIds: string[] };

/** Latest-preview eligibility result for one channel */
export interface LastChatItem {
    channelId: string;
    /** Max chatNo in that channel's cache (regardless of preview eligibility) — the baseline the web's head trigger compares against */
    lastNo: number;
    /** Latest row that passed the preview rules. null if the channel has no previewable row */
    item: CacheChatView | null;
}

/**
 * [Response] Preview eligibility results for the requested channels.
 *
 * `items: null` signals a native processing error (same convention as sibling handlers) — the web
 * only falls back for that single read and doesn't learn it as unsupported. A channel with no
 * cached rows isn't represented by null but by `{ lastNo: 0, item: null }`.
 */
export type OnFetchLastChatsDataPayload = CacheBasePayload<'chat'> & {
    channelIds: string[];
    items: LastChatItem[] | null;
};

/** [Request] Fetch multiple/paged data (combines query and meta to build the cache key) */
export type FetchAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & {
        query?: CacheQueryMap[K] & PagingMeta;
    };
}[CacheType];

/** [Response] Returns multiple items */
export type OnFetchAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & {
        items: CacheModelMap[K][] | null;
        query?: CacheQueryMap[K] & PagingMeta;
    };
}[CacheType];

/** [Request] Save a single item */
export type SaveCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string; item: CacheModelMap[K] };
}[CacheType];

/** [Response] Result of a single save */
export type OnSaveCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string | null; success: boolean };
}[CacheType];

/** [Request] Save multiple items (including paging index) */
export type SaveAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & {
        query?: CacheQueryMap[K] & PagingMeta;
        items: CacheModelMap[K][];
    };
}[CacheType];

/** [Response] Result of a multi-save */
export type OnSaveAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & {
        ids: string[];
        success: boolean;
        query?: CacheQueryMap[K] & PagingMeta;
    };
}[CacheType];

/** [Request] Delete a single item */
export type DeleteCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string };
}[CacheType];

/** [Response] Result of a single delete */
export type OnDeleteCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string | null; success: boolean };
}[CacheType];

/** [Request] Delete by multiple IDs */
export type DeleteAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { ids: string[] };
}[CacheType];

/** [Response] Result of a multi-delete */
export type OnDeleteAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { ids: string[]; success: boolean };
}[CacheType];

/** [Request] Clear an entire domain table */
export type ClearCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K>;
}[CacheType];

/** [Response] Clear result */
export type OnClearCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { success: boolean };
}[CacheType];

/**
 * [Request] Delete only the rows for one channel (ADR-0067).
 *
 * Why this is a separate message instead of adding `channelId` onto `ClearCacheData`: since the
 * web ships ahead of the app, an older app that doesn't know this field simply ignores it and
 * **clears the entire table for that scope**. Making it a new message type turns the same
 * situation into `NOT_FOUND`, and the web learns that once and falls back to a read-then-delete
 * approach.
 */
export type ClearCacheDataByChannelPayload = {
    [K in CacheType]: CacheBasePayload<K> & { channelId: string };
}[CacheType];

/** [Response] Result of a channel-scoped delete */
export type OnClearCacheDataByChannelPayload = {
    [K in CacheType]: CacheBasePayload<K> & { channelId: string; success: boolean };
}[CacheType];

/** [Request] Keyword-based global search */
export type SearchGlobalCacheDataPayload = {
    keyword: string;
    cid?: string;
    uid?: string;
};

/** [Response] List of global search results */
export type OnSearchGlobalCacheDataPayload = {
    items: (CacheChatView | CacheChannelView | CacheSiteView)[];
};

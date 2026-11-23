import type {
    ChannelView,
    ChatView,
    JoinView,
    ProfileDisplay,
    ProfileView,
    UploadView,
    UserView,
} from '@lemoncloud/chatic-socials-api';
import type { CloudView, MyInviteView, MySiteView } from '@lemoncloud/chatic-backend-api';

export type CacheType = 'channel' | 'chat' | 'user' | 'join' | 'site' | 'invitecloud' | 'profile' | 'meta' | 'invite';

export type CacheDomainVersions = Partial<Record<CacheType, number>>;

export type PagingMeta = {
    page?: number;
    cursorNo?: number;
    limit?: number;
    total?: number;
    readNo?: number;
    took?: number;
};

export type CacheTtlMeta = {
    lastSyncedAt: number;
    expiresAt: number;
};

export type CacheViewBase = {
    __cacheMeta?: CacheTtlMeta;
};

type CacheBasePayload<K extends CacheType> = {
    type: K;
    cid: string;
    uid: string;
};

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

export type CacheCloudView = CloudView &
    CacheViewBase & {
        id: string;
        name?: string;
        backend?: string;
        wss?: string;
        cid: string;
        cloudType?: 'invited' | 'owner';
        acceptedBy?: string[];
    };

export type CacheChannelView = ChannelView &
    CacheViewBase & {
        id: string;
        cid: string;
        sid: string;
        isNotificationEnabled: boolean;
        lastActivityAt?: number;
    };

export type PendingUploadSlot = {
    localStatus: 'sending' | 'failed';
    localThumbUrl: string;
    localName?: string;
    localContentType?: string;
    localSize?: number;
};

export type ChatMediaKind = 'image' | 'video' | 'file' | 'audio' | 'link';

export const CHAT_MEDIA_KINDS: readonly ChatMediaKind[] = ['image', 'video', 'file', 'audio', 'link'];

export interface ChatMediaEntry {
    kind: ChatMediaKind;
    idx: number;
    ref: string;
}

export type CacheChatView = Omit<ChatView, 'upload$$'> &
    CacheViewBase & {
        upload$$?: (UploadView | PendingUploadSlot)[];
        id: string;
        cid: string;
        channelId: string;
        chatNo: number;
        isPending: boolean;
        isFailed: boolean;
        createdAtMs: number;
        updatedAtMs: number;
        tempId?: string;
        hiddenByFeed?: boolean;
        mediaEntries?: ChatMediaEntry[];
        mediaEntriesVersion?: number;
    };

export type CacheSiteView = MySiteView &
    CacheViewBase & {
        id: string;
        cid: string;
        order: number;
    };

export type CacheJoinView = JoinView &
    CacheViewBase & {
        id: string;
        cid: string;
        channelId: string;
        userId: string;
        joined: number;
        readNo: number;
        metaNo?: number;
    };

export type CacheUserView = UserView &
    CacheViewBase & {
        id: string;
        cid: string;
    };

export type CacheMetaView = CacheViewBase & {
    id: string;
    cid: string;
    uid: string;
    syncedAt?: number;
    routing?: string;
};

export type CacheInviteView = Omit<MyInviteView, 'code' | 'deeplink'> &
    CacheViewBase & {
        id: string;
        cid: string;
        uid: string;
        dismissedAt?: number;
    };

export type CacheProfileView = ProfileView &
    Partial<ProfileDisplay> &
    CacheViewBase & {
        id: string;
        cid: string;
        sid: string;
        uid: string;
        userId: string;
        updatedAtMs: number;
    };

export type BaseQueryOptions = {
    cid?: string;
    uid?: string;
};

export type ChannelQueryOptions = BaseQueryOptions & {
    sid?: string;
    keyword?: string;
};

export type ChatQueryOptions = BaseQueryOptions & {
    channelId?: string;
    sort?: 'asc' | 'desc';
    keyword?: string;
    limit?: number;
    cursorNo?: number;
    includeUnsent?: boolean;
};

export type InviteCloudQueryOptions = BaseQueryOptions;

export type JoinQueryOptions = BaseQueryOptions & {
    channelId?: string;
    userId?: string;
};

export type UserQueryOptions = BaseQueryOptions;

export type SiteQueryOptions = BaseQueryOptions & {
    keyword?: string;
};

export type ProfileQueryOptions = BaseQueryOptions & {
    sid?: string;
};

export type MetaQueryOptions = BaseQueryOptions;

export type InviteQueryOptions = BaseQueryOptions;

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

export type FetchCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string };
}[CacheType];

export type OnFetchCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string; item: CacheModelMap[K] | null };
}[CacheType];

export type FetchManyCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { ids: string[] };
}[CacheType];

export type OnFetchManyCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { ids: string[]; items: CacheModelMap[K][] | null };
}[CacheType];

export type FetchLastChatsDataPayload = CacheBasePayload<'chat'> & { channelIds: string[] };

export interface LastChatItem {
    channelId: string;
    lastNo: number;
    item: CacheChatView | null;
    activityItem?: CacheChatView | null;
}

export type OnFetchLastChatsDataPayload = CacheBasePayload<'chat'> & {
    channelIds: string[];
    items: LastChatItem[] | null;
};

export type FetchAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & {
        query?: CacheQueryMap[K] & PagingMeta;
    };
}[CacheType];

export type OnFetchAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & {
        items: CacheModelMap[K][] | null;
        query?: CacheQueryMap[K] & PagingMeta;
    };
}[CacheType];

export type SaveCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string; item: CacheModelMap[K] };
}[CacheType];

export type OnSaveCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string | null; success: boolean };
}[CacheType];

export type SaveAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & {
        query?: CacheQueryMap[K] & PagingMeta;
        items: CacheModelMap[K][];
    };
}[CacheType];

export type OnSaveAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & {
        ids: string[];
        success: boolean;
        query?: CacheQueryMap[K] & PagingMeta;
    };
}[CacheType];

export type DeleteCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string };
}[CacheType];

export type OnDeleteCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string | null; success: boolean };
}[CacheType];

export type DeleteAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { ids: string[] };
}[CacheType];

export type OnDeleteAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { ids: string[]; success: boolean };
}[CacheType];

export type ClearCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K>;
}[CacheType];

export type OnClearCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { success: boolean };
}[CacheType];

export type ClearCacheDataByChannelPayload = {
    [K in CacheType]: CacheBasePayload<K> & { channelId: string };
}[CacheType];

export type OnClearCacheDataByChannelPayload = {
    [K in CacheType]: CacheBasePayload<K> & { channelId: string; success: boolean };
}[CacheType];

export type SearchGlobalCacheDataPayload = {
    keyword: string;
    cid?: string;
    uid?: string;
};

export type OnSearchGlobalCacheDataPayload = {
    items: (CacheChatView | CacheChannelView | CacheSiteView)[];
};

export type FetchChatMediaCacheDataPayload = CacheBasePayload<'chat'> & {
    channelId: string;
    kind: ChatMediaKind;
    cursorNo?: number;
    limit: number;
};

export interface ChatMediaCacheItem extends ChatMediaEntry {
    chatId: string;
    chatNo: number;
    chat: CacheChatView;
}

export interface ChatMediaPage {
    items: ChatMediaCacheItem[];
    nextCursorNo: number | null;
}

export type OnFetchChatMediaCacheDataPayload = CacheBasePayload<'chat'> & {
    channelId: string;
    kind: ChatMediaKind;
    items: ChatMediaCacheItem[] | null;
    nextCursorNo: number | null;
};

export type ChatMediaCounts = Record<ChatMediaKind, number>;

export type CountChatMediaCacheDataPayload = CacheBasePayload<'chat'> & {
    channelId: string;
};

export type OnCountChatMediaCacheDataPayload = CacheBasePayload<'chat'> & {
    channelId: string;
    counts: ChatMediaCounts | null;
};

export interface ChatMediaFillItem {
    chatId: string;
    channelId: string;
    chatNo: number;
    entries: ChatMediaEntry[];
}

export type SaveChatMediaCacheDataPayload = CacheBasePayload<'chat'> & {
    items: ChatMediaFillItem[];
    version: number;
};

export type OnSaveChatMediaCacheDataPayload = CacheBasePayload<'chat'> & {
    success: boolean;
};

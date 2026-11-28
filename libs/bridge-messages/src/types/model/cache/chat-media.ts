import type { CacheBasePayload } from './base-payload';
import type { ChatMediaCounts, ChatMediaEntry, ChatMediaKind } from './media-entry';
import type { CacheChatView } from './views';

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

import type { ChatFeedResult, ChatView } from '@lemoncloud/chatic-socials-api';
import type { ChatFeedPayload } from '@lemoncloud/chatic-sockets-api';
import { BaseLocalDataSource, type LocalDataSourceContextOverride } from './types';
import type { DataContextProvider } from '../../repositories';
import type { CacheStorage, CacheStorageItem } from '../storages';

export interface IChatLocalDataSource {
    /** 채널 메시지 피드를 로컬 캐시에서 cursor 기반으로 조회합니다. */
    fetchChat(
        payload: ChatFeedPayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<ChatFeedResult | null>;

    /** 특정 채널의 모든 메시지를 시간순으로 조회합니다. */
    getChatsByChannel(channelId: string, contextOverride?: LocalDataSourceContextOverride): Promise<ChatView[]>;

    /** 단일 메시지를 저장/병합합니다. */
    upsertChat(chat: ChatView, contextOverride?: LocalDataSourceContextOverride): Promise<void>;

    /** 다수 메시지를 저장/병합합니다. */
    upsertChats(chats: ChatView[], contextOverride?: LocalDataSourceContextOverride): Promise<void>;

    /** 단일 메시지를 삭제합니다. */
    deleteChat(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
}

const DEFAULT_CHAT_LIMIT = 30;

const getChatNo = (chat: ChatView): number | undefined => {
    const chatNo = (chat as { chatNo?: number }).chatNo;
    return typeof chatNo === 'number' ? chatNo : undefined;
};

const getChatSortTime = (chat: ChatView): number => {
    const createdAt = (chat as { createdAt?: string | number }).createdAt;
    if (typeof createdAt === 'number') return createdAt;
    if (createdAt) return new Date(createdAt).getTime();
    return 0;
};

const sortByNewest = (left: ChatView, right: ChatView): number => {
    const leftNo = getChatNo(left);
    const rightNo = getChatNo(right);
    if (leftNo !== undefined && rightNo !== undefined) return rightNo - leftNo;
    if (leftNo !== undefined) return -1;
    if (rightNo !== undefined) return 1;
    return getChatSortTime(right) - getChatSortTime(left);
};

const sortByOldest = (left: ChatView, right: ChatView): number => -sortByNewest(left, right);
type ChatCache = CacheStorageItem<'chat'>;
const toDomainChat = (chat: ChatCache): ChatView => ({ ...chat });

export class ChatLocalDataSource extends BaseLocalDataSource implements IChatLocalDataSource {
    constructor(
        protected override readonly contextProvider: DataContextProvider,
        protected readonly cacheStorage: CacheStorage<'chat'>
    ) {
        super(contextProvider);
    }

    fetchChat(
        payload: ChatFeedPayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<ChatFeedResult | null> {
        // channelId 없이 feed를 만들 수 없으므로 null을 반환합니다.
        const channelId = payload.channelId;
        if (!channelId) return Promise.resolve(null);

        // cursorNo=0은 더 이상 이전 메시지가 없음을 의미합니다.
        if ((payload as { cursorNo?: number }).cursorNo === 0) {
            return Promise.resolve({
                list: [],
                cursorNo: 0,
                limit: payload.limit ?? DEFAULT_CHAT_LIMIT,
                readNo: 0,
                total: 0,
            } as ChatFeedResult);
        }

        return this.getChatsByChannel(channelId, contextOverride).then(allMessages => {
            if (allMessages.length === 0) return null;

            // 최신순 후보를 제한한 뒤 반환 포맷은 오래된 순으로 맞춥니다.
            const cursorNo = (payload as { cursorNo?: number }).cursorNo;
            const limit = payload.limit ?? DEFAULT_CHAT_LIMIT;
            const newestFirst = [...allMessages].sort(sortByNewest);
            const candidates =
                cursorNo === undefined
                    ? newestFirst
                    : newestFirst.filter(chat => {
                          const chatNo = getChatNo(chat);
                          return chatNo !== undefined && chatNo < cursorNo;
                      });
            const page = candidates.slice(0, limit).sort(sortByOldest);

            if (page.length === 0) {
                return { list: [], cursorNo: 0, limit, readNo: 0, total: allMessages.length } as ChatFeedResult;
            }

            const numericChatNos = page.map(getChatNo).filter((chatNo): chatNo is number => chatNo !== undefined);
            const minChatNo = numericChatNos.length > 0 ? Math.min(...numericChatNos) : undefined;
            const hasOlder =
                minChatNo !== undefined &&
                newestFirst.some(chat => (getChatNo(chat) ?? Number.POSITIVE_INFINITY) < minChatNo);
            const nextCursorNo = hasOlder && minChatNo !== undefined ? minChatNo : 0;

            return {
                list: page,
                cursorNo: nextCursorNo,
                limit,
                readNo: 0,
                total: allMessages.length,
            } as ChatFeedResult;
        });
    }

    public async getChatsByChannel(
        channelId: string,
        _contextOverride?: LocalDataSourceContextOverride
    ): Promise<ChatView[]> {
        if (!channelId) return [];
        const allMessages = await this.cacheStorage.loadAll();
        return allMessages
            .filter(chat => chat.channelId === channelId)
            .sort(sortByOldest)
            .map(toDomainChat);
    }

    public async upsertChat(chat: ChatView, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const id = chat.id;
        if (!id) return;

        const cacheItem: ChatCache = {
            ...chat,
            cid: this.getCid(contextOverride),
            isPending: (chat as { isPending?: boolean }).isPending ?? false,
            isFailed: (chat as { isFailed?: boolean }).isFailed ?? false,
        };
        await this.cacheStorage.save(id, cacheItem);
    }

    public async upsertChats(chats: ChatView[], contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await Promise.all(chats.map(chat => this.upsertChat(chat, contextOverride)));
    }

    public async deleteChat(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        if (!id) return;
        await this.cacheStorage.delete(id);
    }
}

import type { ChatFeedPayload } from '@lemoncloud/chatic-sockets-api';
import {
    BaseLocalDataSource,
    type ICrudLocalDataSource,
    type IListLocalDataSource,
    type IStreamLocalDataSource,
    type LocalDataSourceContextOverride,
    type LocalStreamCallback,
    type LocalStreamUnsubscribe,
} from './types';
import type { DataContextProvider } from '../../repositories';
import type { CacheStorage, CacheStorageItem } from '../storages';
import { toDomainChat } from './mappers';
import type { DomainChat, DomainChatFeedResult } from '../../domain';
import { toDomainChat as toDomainChatBase } from '../../domain';

export interface IChatLocalDataSource
    extends ICrudLocalDataSource<DomainChat>,
        IListLocalDataSource<DomainChat, ChatFeedPayload, DomainChatFeedResult>,
        IStreamLocalDataSource<DomainChat, ChatFeedPayload, DomainChatFeedResult> {
    /** 채널 메시지 피드를 로컬 캐시에서 cursor 기반으로 조회합니다. */
    fetchChat(
        payload: ChatFeedPayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainChatFeedResult | null>;

    /** 특정 채널의 모든 메시지를 시간순으로 조회합니다. */
    getChatsByChannel(channelId: string, contextOverride?: LocalDataSourceContextOverride): Promise<DomainChat[]>;

    /** 단일 메시지를 id로 조회합니다. */
    getChat(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<DomainChat | null>;

    /** 단일 메시지를 저장/병합합니다. */
    upsertChat(chat: Partial<DomainChat>, contextOverride?: LocalDataSourceContextOverride): Promise<void>;

    /** 다수 메시지를 저장/병합합니다. */
    upsertChats(chats: Array<Partial<DomainChat>>, contextOverride?: LocalDataSourceContextOverride): Promise<void>;

    /** 단일 메시지를 삭제합니다. */
    deleteChat(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void>;

    /** 다중 메시지를 삭제합니다. */
    deleteChats(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void>;

    /** 메시지 일부 필드만 병합 업데이트합니다. */
    updateChatPartial(
        id: string,
        patch: Partial<DomainChat>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void>;

    /** 현재 스코프의 메시지 캐시를 초기화합니다. */
    clearAll(contextOverride?: LocalDataSourceContextOverride): Promise<void>;

    /** 채널 메시지의 연속성(누락 구간)을 검사합니다. */
    checkContinuity(
        channelId: string,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<{ hasGap: boolean; missingRanges: Array<{ from: number; to: number }> }>;

    /** 채널 feed 조회 결과를 스트림으로 구독합니다. */
    subscribeChatFeed(
        payload: ChatFeedPayload,
        callback: LocalStreamCallback<DomainChatFeedResult | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe;

    /** 단일 메시지 조회 결과를 스트림으로 구독합니다. */
    subscribeChat(
        id: string,
        callback: LocalStreamCallback<DomainChat | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe;
}

const DEFAULT_CHAT_LIMIT = 30;
type ChatCache = CacheStorageItem<'chat'>;
type ChatSortable = Partial<DomainChat> | ChatCache;

const getChatNo = (chat: ChatSortable): number | undefined => {
    const chatNo = (chat as { chatNo?: number }).chatNo;
    return typeof chatNo === 'number' ? chatNo : undefined;
};

const getChatSortTime = (chat: ChatSortable): number => {
    const createdAt = (chat as { createdAt?: string | number }).createdAt;
    if (typeof createdAt === 'number') return createdAt;
    if (createdAt) return new Date(createdAt).getTime();
    return 0;
};

const sortByNewest = (left: ChatSortable, right: ChatSortable): number => {
    const leftNo = getChatNo(left);
    const rightNo = getChatNo(right);
    if (leftNo !== undefined && rightNo !== undefined) return rightNo - leftNo;
    if (leftNo !== undefined) return -1;
    if (rightNo !== undefined) return 1;
    return getChatSortTime(right) - getChatSortTime(left);
};

const sortByOldest = (left: ChatSortable, right: ChatSortable): number => -sortByNewest(left, right);

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
    ): Promise<DomainChatFeedResult | null> {
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
            } as DomainChatFeedResult);
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
                return { list: [], cursorNo: 0, limit, readNo: 0, total: allMessages.length } as DomainChatFeedResult;
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
            } as DomainChatFeedResult;
        });
    }

    public async getChatsByChannel(
        channelId: string,
        _contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainChat[]> {
        if (!channelId) return [];
        const allMessages = await this.cacheStorage.loadAll();
        return allMessages
            .filter(chat => chat.channelId === channelId)
            .sort(sortByOldest)
            .map(toDomainChat);
    }

    public async getChat(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<DomainChat | null> {
        if (!id) return null;
        const item = await this.cacheStorage.load(id);
        return item ? toDomainChat(item) : null;
    }

    public async upsertChat(
        chat: Partial<DomainChat>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const id = chat.id;
        if (!id) return;

        const context = this.getContext(contextOverride);
        const existing = await this.cacheStorage.load(id);
        const normalized = toDomainChatBase(
            {
                ...(existing ?? {}),
                ...(chat as Record<string, unknown>),
                cid: context.cid || this.getCid(contextOverride),
            } as Partial<DomainChat>,
            {
                cid: context.cid || this.getCid(contextOverride),
                sid: context.sid,
                uid: context.uid,
            }
        );

        const cacheItem: ChatCache = normalized as ChatCache;
        await this.cacheStorage.save(id, cacheItem);
        await this.emitAllStreams();
    }

    public async upsertChats(
        chats: Array<Partial<DomainChat>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        await Promise.all(chats.map(chat => this.upsertChat(chat, contextOverride)));
    }

    public async deleteChat(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        if (!id) return;
        await this.cacheStorage.delete(id);
        await this.emitAllStreams();
    }

    public async deleteChats(ids: string[], _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
        await this.emitAllStreams();
    }

    public async updateChatPartial(
        id: string,
        patch: Partial<DomainChat>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        if (!id) return;
        const existing = await this.cacheStorage.load(id);
        if (!existing) return;
        await this.upsertChat({ ...existing, ...patch }, contextOverride);
    }

    public async clearAll(_contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
        await this.emitAllStreams();
    }

    public async checkContinuity(
        channelId: string,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<{ hasGap: boolean; missingRanges: Array<{ from: number; to: number }> }> {
        const messages = await this.getChatsByChannel(channelId, contextOverride);
        const chatNos = messages
            .map(getChatNo)
            .filter((chatNo): chatNo is number => chatNo !== undefined)
            .sort((a, b) => a - b);

        if (chatNos.length < 2) {
            return { hasGap: false, missingRanges: [] };
        }

        const missingRanges: Array<{ from: number; to: number }> = [];
        for (let index = 1; index < chatNos.length; index += 1) {
            const previous = chatNos[index - 1];
            const current = chatNos[index];
            if (current - previous <= 1) continue;
            missingRanges.push({ from: previous + 1, to: current - 1 });
        }

        return {
            hasGap: missingRanges.length > 0,
            missingRanges,
        };
    }

    /** 로컬 채팅 feed 스냅샷을 지속 구독합니다. */
    public subscribeChatFeed(
        payload: ChatFeedPayload,
        callback: LocalStreamCallback<DomainChatFeedResult | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.fetchChat(payload, contextOverride), callback);
    }

    /** 로컬 단일 메시지 스냅샷을 지속 구독합니다. */
    public subscribeChat(
        id: string,
        callback: LocalStreamCallback<DomainChat | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.getChat(id, contextOverride), callback);
    }

    /** 공통 CRUD 인터페이스: 리스트 조회 */
    public fetchList(
        query: ChatFeedPayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainChatFeedResult | null> {
        return this.fetchChat(query, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 단건 조회 */
    public getById(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<DomainChat | null> {
        return this.getChat(id, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 단건 저장 */
    public upsert(item: Partial<DomainChat>, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        return this.upsertChat(item, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 다건 저장 */
    public upsertMany(
        items: Array<Partial<DomainChat>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        return this.upsertChats(items, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 단건 삭제 */
    public remove(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        return this.deleteChat(id, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 다건 삭제 */
    public removeMany(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        return this.deleteChats(ids, contextOverride);
    }

    /** 공통 Stream 인터페이스: 리스트 구독 */
    public subscribeList(
        query: ChatFeedPayload,
        callback: LocalStreamCallback<DomainChatFeedResult | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeChatFeed(query, callback, contextOverride);
    }

    /** 공통 Stream 인터페이스: 단건 구독 */
    public subscribeItem(
        id: string,
        callback: LocalStreamCallback<DomainChat | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeChat(id, callback, contextOverride);
    }
}

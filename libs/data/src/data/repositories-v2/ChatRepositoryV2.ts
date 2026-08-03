import type { ChatFeedInput, ChatSendInput } from '@lemoncloud/chatic-sockets-api';
import type { DomainChat, DomainListResult } from '../domain';
import type { IChatLocalDataSourceV2 } from '../local/data-sources-v2';
import type {
    ChatDeleteInput,
    ChatGetInput,
    ChatReactionInput,
    ChatUpdateInput,
    IChatRemoteDataSource,
} from '../remote/data-sources';
import type { DataContext, DataContextProvider } from './types';
import { BaseRepositoryV2, type DisposableRepositoryV2 } from './types';

export interface ChatRefreshResult {
    fetchedCount: number;
    cursorNo?: number;
    readNo?: number;
    total: number;
}

export interface IChatRepositoryV2 extends DisposableRepositoryV2 {
    observeList(query: ChatFeedInput, callback: (result: DomainListResult<DomainChat> | null) => void): () => void;
    observeItem(id: string, callback: (item: DomainChat | null) => void): () => void;

    refreshList(query: ChatFeedInput): Promise<ChatRefreshResult>;
    getChat(payload: ChatGetInput): Promise<DomainChat>;
    sendChat(payload: ChatSendInput): Promise<DomainChat>;
    updateChat(payload: ChatUpdateInput): Promise<DomainChat>;
    deleteChat(payload: ChatDeleteInput): Promise<DomainChat>;
    setReaction(payload: ChatReactionInput): Promise<DomainChat>;

    cacheRead(id: string): Promise<DomainChat | null>;
    cacheReadList(query: ChatFeedInput): Promise<DomainListResult<DomainChat> | null>;
    cacheWrite(item: Partial<DomainChat>): Promise<void>;
    cacheWriteMany(items: Array<Partial<DomainChat>>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
    cacheClearByChannelId(channelId: string): Promise<void>;
}

/** Manages local-first chat timelines, pending states, and remote synchronization. */
export class ChatRepositoryV2 extends BaseRepositoryV2 implements IChatRepositoryV2 {
    constructor(
        private readonly chatRemoteDataSource: IChatRemoteDataSource,
        private readonly chatLocalDataSource: IChatLocalDataSourceV2,
        contextProvider: DataContextProvider
    ) {
        super(contextProvider);
    }

    public observeList(
        query: ChatFeedInput,
        callback: (result: DomainListResult<DomainChat> | null) => void
    ): () => void {
        return this.chatLocalDataSource.observeList(query, callback, this.getRepositoryContext());
    }

    public observeItem(id: string, callback: (item: DomainChat | null) => void): () => void {
        return this.chatLocalDataSource.observeItem(id, callback, this.getRepositoryContext());
    }

    public cacheRead(id: string): Promise<DomainChat | null> {
        return this.chatLocalDataSource.cacheRead(id, this.getRepositoryContext());
    }

    public cacheReadList(query: ChatFeedInput): Promise<DomainListResult<DomainChat> | null> {
        return this.chatLocalDataSource.cacheReadList(query, this.getRepositoryContext());
    }

    public cacheWrite(item: Partial<DomainChat>): Promise<void> {
        return this.chatLocalDataSource.cacheWrite(item, this.getRepositoryContext());
    }

    public cacheWriteMany(items: Array<Partial<DomainChat>>): Promise<void> {
        return this.chatLocalDataSource.cacheWriteMany(items, this.getRepositoryContext());
    }

    public cacheDelete(id: string): Promise<void> {
        return this.chatLocalDataSource.cacheDelete(id, this.getRepositoryContext());
    }

    public cacheClear(): Promise<void> {
        return this.chatLocalDataSource.cacheClear(this.getRepositoryContext());
    }

    public cacheClearByChannelId(channelId: string): Promise<void> {
        return this.chatLocalDataSource.cacheClearByChannelId(channelId, this.getRepositoryContext());
    }

    public async refreshList(query: ChatFeedInput): Promise<ChatRefreshResult> {
        this.assertRequiredString(query.channelId, 'channelId');
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const remote = await this.chatRemoteDataSource.fetchChat(query, normalizedContext);
        const domainList = remote.list || [];
        await this.chatLocalDataSource.cacheWriteMany(domainList, requestContext);

        return {
            fetchedCount: domainList.length,
            cursorNo: remote.cursorNo,
            readNo: remote.readNo,
            total: remote.total ?? domainList.length,
        };
    }

    public async getChat(payload: ChatGetInput): Promise<DomainChat> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const domainChat = await this.chatRemoteDataSource.getChat(payload, normalizedContext);
        await this.chatLocalDataSource.cacheWrite(domainChat, requestContext);

        return domainChat;
    }

    public async sendChat(payload: ChatSendInput): Promise<DomainChat> {
        this.assertRequiredString(payload.channelId, 'channelId');
        const requestRef = `chat-send-${Date.now()}`;
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const optimisticChat = this.createOptimisticChat(payload, `optimistic-${requestRef}`, normalizedContext);
        await this.chatLocalDataSource.cacheWrite(optimisticChat, requestContext);

        try {
            const remote = await this.chatRemoteDataSource.sendChat(payload, normalizedContext);
            const domainChat: DomainChat = {
                ...remote,
                tempId: optimisticChat.id,
                isPending: false,
                isFailed: false,
            };
            await this.chatLocalDataSource.cacheWrite(domainChat, requestContext);
            if (domainChat.id && optimisticChat.id !== domainChat.id) {
                await this.chatLocalDataSource.cacheDelete(optimisticChat.id, requestContext);
            }
            return domainChat;
        } catch (error) {
            await this.chatLocalDataSource.cacheWrite(
                {
                    ...optimisticChat,
                    isPending: false,
                    isFailed: true,
                    updatedAt: Date.now(),
                },
                requestContext
            );
            throw error;
        }
    }

    public async updateChat(payload: ChatUpdateInput): Promise<DomainChat> {
        const chatId = this.assertRequiredString((payload as { id?: string }).id, 'id');
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const existing = await this.chatLocalDataSource.cacheRead(chatId, requestContext);

        await this.chatLocalDataSource.cacheWrite(
            {
                ...(existing ?? { id: chatId }),
                ...(payload as Partial<DomainChat>),
                id: chatId,
            },
            requestContext
        );

        try {
            const domainChat = await this.chatRemoteDataSource.updateChat(payload, normalizedContext);
            await this.chatLocalDataSource.cacheWrite(domainChat, requestContext);
            return domainChat;
        } catch (error) {
            if (existing) {
                await this.chatLocalDataSource.cacheWrite(existing, requestContext);
            }
            throw error;
        }
    }

    /**
     * Publish a reaction on/off event.
     *
     * The reaction is not a field on the target message but a separate event chat, so
     * the optimistic write is an event of our own: a provisional row with no `chatNo`,
     * which the fold sorts last and therefore treats as the newest state for that
     * (message, person, emoji). The chip flips on the click, not on the round trip.
     *
     * On success the provisional row is replaced by the server's event; the broadcast
     * echo carries the same `chatNo` and lands on that same row. On failure it is
     * removed, so the chip returns to what the remaining events say — there is no
     * previous value to restore, because the event never existed anywhere but here.
     */
    public async setReaction(payload: ChatReactionInput): Promise<DomainChat> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const { chatId, emoji, action } = payload as { chatId: string; emoji: string; action: string };
        const now = Date.now();
        const provisionalId = `optimistic-reaction-${chatId}-${emoji}-${now}`;
        const provisional: DomainChat = {
            id: provisionalId,
            tempId: provisionalId,
            cid: normalizedContext.cid ?? 'default',
            // The event belongs to the target's channel — the id is `<channelId>:<chatNo>`.
            channelId: chatId.split(':')[0] ?? '',
            chatNo: 0,
            stereo: 'system',
            subType: 'reaction',
            reaction$: { chatId, emoji, action },
            ownerId: normalizedContext.uid,
            createdAt: now,
            updatedAt: now,
            createdAtMs: now,
            updatedAtMs: now,
            isPending: true,
            isFailed: false,
        } as DomainChat;
        await this.chatLocalDataSource.cacheWrite(provisional, requestContext);

        try {
            const event = await this.chatRemoteDataSource.setReaction(payload, normalizedContext);
            await this.chatLocalDataSource.cacheWrite(event, requestContext);
            if (event.id && event.id !== provisionalId) {
                await this.chatLocalDataSource.cacheDelete(provisionalId, requestContext);
            }
            return event;
        } catch (error) {
            await this.chatLocalDataSource.cacheDelete(provisionalId, requestContext);
            throw error;
        }
    }

    public async deleteChat(payload: ChatDeleteInput): Promise<DomainChat> {
        const chatId = this.assertRequiredString((payload as { id?: string }).id, 'id');
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const existing = await this.chatLocalDataSource.cacheRead(chatId, requestContext);

        await this.chatLocalDataSource.cacheDelete(chatId, requestContext);

        try {
            return await this.chatRemoteDataSource.deleteChat(payload, normalizedContext);
        } catch (error) {
            if (existing) {
                await this.chatLocalDataSource.cacheWrite(existing, requestContext);
            }
            throw error;
        }
    }

    // Optimistic chats are built as domain literals (no mapper); cacheWrite fills any remaining defaults.
    private createOptimisticChat(payload: ChatSendInput, id: string, normalizedContext: DataContext): DomainChat {
        const now = Date.now();
        return {
            id,
            tempId: id,
            userId: normalizedContext.uid,
            cid: normalizedContext.cid ?? 'default',
            channelId: payload.channelId || '',
            chatNo: 0,
            content: payload.content,
            contentType: payload.contentType ?? 'text',
            parentId: (payload as { parentId?: string }).parentId,
            ownerId: normalizedContext.uid,
            createdAt: now,
            updatedAt: now,
            createdAtMs: now,
            updatedAtMs: now,
            isOwner: true,
            isPending: true,
            isFailed: false,
        } as DomainChat;
    }
}

import type { ChatFeedInput, ChatSendInput } from '@lemoncloud/chatic-sockets-api';
import type { ChatFeedResult, ChatView } from '@lemoncloud/chatic-socials-api';
import type { DomainChat, DomainListResult, DomainScope } from '../domain';
import { toDomainChat } from '../domain';
import type { IChatLocalDataSourceV2 } from '../local/data-sources-v2';
import type { ChatDeleteInput, ChatGetInput, ChatUpdateInput, IChatRemoteDataSource } from '../remote/data-sources';
import { BaseRepositoryV2, type DataContextProviderV2, type DisposableRepositoryV2 } from './types';

export interface ChatRefreshResult {
    wroteCount: number;
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
        contextProvider: DataContextProviderV2
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
        const requestContext = this.getRepositoryContext();
        const requestScope = this.getDomainScope();
        const remote = (await this.chatRemoteDataSource.fetchChat(query)) as ChatFeedResult;
        const domainList = ((remote?.list || []) as ChatView[]).map(item => toDomainChat(item, requestScope));

        if (this.isSameContext(requestContext)) {
            await this.chatLocalDataSource.cacheWriteMany(domainList, requestContext);
        }

        return {
            wroteCount: domainList.length,
            cursorNo: remote?.cursorNo,
            readNo: remote?.readNo,
            total: remote?.total ?? domainList.length,
        };
    }

    public async getChat(payload: ChatGetInput): Promise<DomainChat> {
        const requestContext = this.getRepositoryContext();
        const requestScope = this.getDomainScope();
        const remote = await this.chatRemoteDataSource.getChat(payload);
        const domainChat = toDomainChat(remote, requestScope);

        if (this.isSameContext(requestContext)) {
            await this.chatLocalDataSource.cacheWrite(domainChat, requestContext);
        }

        return domainChat;
    }

    public async sendChat(payload: ChatSendInput): Promise<DomainChat> {
        this.assertRequiredString(payload.channelId, 'channelId');
        const requestRef = `chat-send-${Date.now()}`;
        const repositoryContext = this.getRepositoryContext();
        const domainScope = this.getDomainScope();
        const optimisticChat = this.createOptimisticChat(payload, `optimistic-${requestRef}`, domainScope);
        await this.chatLocalDataSource.cacheWrite(optimisticChat, repositoryContext);

        try {
            const remote = (await this.chatRemoteDataSource.sendChat(payload)) as ChatView;
            const domainChat = toDomainChat(
                {
                    ...remote,
                    tempId: optimisticChat.id,
                    isPending: false,
                    isFailed: false,
                },
                domainScope
            );
            await this.chatLocalDataSource.cacheWrite(domainChat, repositoryContext);
            if (domainChat.id && optimisticChat.id !== domainChat.id) {
                await this.chatLocalDataSource.cacheDelete(optimisticChat.id, repositoryContext);
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
                repositoryContext
            );
            throw error;
        }
    }

    public async updateChat(payload: ChatUpdateInput): Promise<DomainChat> {
        const chatId = this.assertRequiredString((payload as { id?: string }).id, 'id');
        const context = this.getRepositoryContext();
        const existing = await this.chatLocalDataSource.cacheRead(chatId, context);

        await this.chatLocalDataSource.cacheWrite(
            {
                ...(existing ?? { id: chatId }),
                ...(payload as Partial<DomainChat>),
                id: chatId,
            },
            context
        );

        try {
            const remote = await this.chatRemoteDataSource.updateChat(payload);
            const domainChat = toDomainChat(remote, this.getDomainScope());
            await this.chatLocalDataSource.cacheWrite(domainChat, context);
            return domainChat;
        } catch (error) {
            if (existing) {
                await this.chatLocalDataSource.cacheWrite(existing, context);
            }
            throw error;
        }
    }

    public async deleteChat(payload: ChatDeleteInput): Promise<DomainChat> {
        const chatId = this.assertRequiredString((payload as { id?: string }).id, 'id');
        const context = this.getRepositoryContext();
        const existing = await this.chatLocalDataSource.cacheRead(chatId, context);

        await this.chatLocalDataSource.cacheDelete(chatId, context);

        try {
            const remote = await this.chatRemoteDataSource.deleteChat(payload);
            return toDomainChat(remote, this.getDomainScope());
        } catch (error) {
            if (existing) {
                await this.chatLocalDataSource.cacheWrite(existing, context);
            }
            throw error;
        }
    }

    private createOptimisticChat(payload: ChatSendInput, id: string, domainScope: DomainScope): DomainChat {
        const now = Date.now();
        return toDomainChat(
            {
                id,
                tempId: id,
                userId: domainScope.uid,
                cid: domainScope.cid,
                channelId: payload.channelId || '',
                content: payload.content,
                contentType: payload.contentType ?? 'text',
                parentId: (payload as { parentId?: string }).parentId,
                ownerId: domainScope.uid,
                createdAt: now,
                updatedAt: now,
                isOwner: true,
                isPending: true,
                isFailed: false,
                chatNo: Number.MAX_SAFE_INTEGER,
            } as Partial<DomainChat>,
            domainScope
        );
    }
}

import type { ChatFeedInput, ChatSendInput } from '@lemoncloud/chatic-sockets-api';
import type { ChatFeedResult, ChatView } from '@lemoncloud/chatic-socials-api';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';
import type { DomainChat, DomainListResult, DomainScope } from '../domain';
import { toDomainChat } from '../domain';
import type { IChatLocalDataSourceV2 } from '../local/data-sources-v2';
import type { IChatRemoteDataSource } from '../remote/data-sources';
import { BaseRepositoryV2, type DataContextProviderV2 } from './types';

export interface ChatRefreshResult {
    wroteCount: number;
    cursorNo?: number;
    readNo?: number;
    total: number;
}

export interface IChatRepositoryV2 {
    observeList(query: ChatFeedInput, callback: (result: DomainListResult<DomainChat> | null) => void): () => void;
    observeItem(id: string, callback: (item: DomainChat | null) => void): () => void;

    refreshList(query: ChatFeedInput): Promise<ChatRefreshResult>;
    sendChat(payload: ChatSendInput): Promise<DomainChat>;

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
        contextProvider: DataContextProviderV2,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(contextProvider, domainEventBus);
        this.initializeInternalListeners();
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

    private initializeInternalListeners(): void {
        this.onDomainEvent('chat:create', detail => {
            this.runInBackground(
                () => this.chatLocalDataSource.cacheWrite(detail.data, this.getRepositoryContext()),
                'chat:create'
            );
        });
        this.onDomainEvent('chat:update', detail => {
            this.runInBackground(
                () => this.chatLocalDataSource.cacheWrite(detail.data, this.getRepositoryContext()),
                'chat:update'
            );
        });
        this.onDomainEvent('chat:delete', detail => {
            this.runInBackground(
                () => this.chatLocalDataSource.cacheDelete(detail.data.id || '', this.getRepositoryContext()),
                'chat:delete'
            );
        });
        this.onDomainEvent('channel:delete', detail => {
            const channelId = detail.data.id || '';
            if (!channelId) return;
            this.runInBackground(
                () => this.chatLocalDataSource.cacheClearByChannelId(channelId, this.getRepositoryContext()),
                'channel:delete->chat:clear'
            );
        });
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

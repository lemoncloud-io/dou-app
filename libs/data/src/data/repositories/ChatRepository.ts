import type { ChatFeedPayload, ChatSendPayload } from '@lemoncloud/chatic-sockets-api';
import type { IChatLocalDataSource } from '../local/data-sources';
import type { IChatRemoteDataSource } from '../remote/data-sources';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
import type { DataContextProvider, RepositoryRequestOptions } from './types';
import { BaseRepository } from './types';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';
import type { DomainChat, DomainChatFeedResult } from '../domain';
import { toDomainChat } from '../domain';

/** 채팅 메시지 도메인의 Repository 공개 계약입니다. */
export interface IChatRepository {
    /** 서버의 chat:send 요청을 수행합니다. */
    sendChat(payload: ChatSendPayload, options?: RepositoryRequestOptions): Promise<DomainChat>;

    /** 서버의 chat:feed 요청을 수행하여 채널의 메시지 피드를 조회합니다. */
    fetchChat(payload: ChatFeedPayload, options?: RepositoryRequestOptions): Promise<DomainChatFeedResult>;
}

/** Remote chat API와 local message cache를 중재합니다. */
export class ChatRepository extends BaseRepository implements IChatRepository {
    constructor(
        private readonly chatRemoteDataSource: IChatRemoteDataSource,
        private readonly chatLocalDataSource: IChatLocalDataSource,
        requestManager: ISocketRequestManager,
        contextProvider: DataContextProvider,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(requestManager, contextProvider, domainEventBus);
        this.initializeInternalListeners();
    }

    /** 메시지 발신을 data source에 위임하고 응답을 기다립니다. */
    public async sendChat(payload: ChatSendPayload, options?: RepositoryRequestOptions): Promise<DomainChat> {
        const chat = await this.requestRemote<DomainChat>(
            ref => this.chatRemoteDataSource.sendChat(payload, ref),
            options
        );
        const domainChat = toDomainChat(chat, this.getDomainScope());
        await this.chatLocalDataSource.upsertChat(domainChat, this.getRepositoryContext());
        return domainChat;
    }

    /** 메시지 피드 조회를 data source에 위임하고 응답을 기다립니다. */
    public async fetchChat(
        payload: ChatFeedPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainChatFeedResult> {
        return this.fetchWithCachePolicy<DomainChatFeedResult>({
            options,
            backgroundLabel: 'chat',
            fetchLocal: async () => {
                const local = await this.chatLocalDataSource.fetchChat(payload, this.getRepositoryContext());
                if (!local) return null;

                // Chat은 cursor 연속성이 깨진 캐시를 신뢰하지 않고 remote를 우선합니다.
                const channelId = payload.channelId;
                if (!channelId) return local;
                const continuity = await this.chatLocalDataSource.checkContinuity(
                    channelId,
                    this.getRepositoryContext()
                );
                return continuity.hasGap ? null : local;
            },
            fetchRemote: remoteOptions => this.fetchFromRemoteAndCache(payload, remoteOptions),
            fallback: () =>
                ({
                    list: [],
                    cursorNo: 0,
                    limit: payload.limit,
                    readNo: 0,
                    total: 0,
                }) as DomainChatFeedResult,
        });
    }

    private async fetchFromRemoteAndCache(
        payload: ChatFeedPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainChatFeedResult> {
        const remote = await this.requestRemote<any>(ref => this.chatRemoteDataSource.fetchChat(payload, ref), options);
        const domainList = ((remote?.list || []) as any[]).map(item => toDomainChat(item, this.getDomainScope()));
        await this.chatLocalDataSource.upsertChats(domainList, this.getRepositoryContext());
        return { ...remote, list: domainList } as DomainChatFeedResult;
    }

    private initializeInternalListeners(): void {
        this.onDomainEvent('chat:create', detail => {
            this.runInBackground(
                () => this.chatLocalDataSource.upsertChat(detail.data, this.getRepositoryContext()),
                'chat:create'
            );
        });
        this.onDomainEvent('chat:update', detail => {
            this.runInBackground(
                () => this.chatLocalDataSource.upsertChat(detail.data, this.getRepositoryContext()),
                'chat:update'
            );
        });
        this.onDomainEvent('chat:delete', detail => {
            this.runInBackground(
                () => this.chatLocalDataSource.deleteChat(detail.data.id || '', this.getRepositoryContext()),
                'chat:delete'
            );
        });
        this.onDomainEvent('chat:list', detail => {
            this.runInBackground(
                () => this.chatLocalDataSource.upsertChats(detail.data.list || [], this.getRepositoryContext()),
                'chat:list'
            );
        });
    }
}

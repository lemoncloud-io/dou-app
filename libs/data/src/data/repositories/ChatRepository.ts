import type { ChatFeedResult, ChatView } from '@lemoncloud/chatic-socials-api';
import type { ChatFeedPayload, ChatSendPayload } from '@lemoncloud/chatic-sockets-api';
import type { IChatLocalDataSource } from '../local/data-sources';
import type { IChatRemoteDataSource } from '../remote/data-sources';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
import type { DataContextProvider, RepositoryRequestOptions } from './types';
import { BaseRepository } from './types';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';

/** 채팅 메시지 도메인의 Repository 공개 계약입니다. */
export interface IChatRepository {
    /** 서버의 chat:send 요청을 수행합니다. */
    sendChat(payload: ChatSendPayload, options?: RepositoryRequestOptions): Promise<ChatView>;

    /** 서버의 chat:feed 요청을 수행하여 채널의 메시지 피드를 조회합니다. */
    fetchChat(payload: ChatFeedPayload, options?: RepositoryRequestOptions): Promise<ChatFeedResult>;

    /** 새로운 채팅 메시지(chat:create) 수신 이벤트를 구독합니다.
     * @param callback 수신된 채팅 데이터를 처리할 콜백 함수
     * @returns 구독 해제(unsubscribe) 함수
     */
    onChatCreated(callback: (chat: ChatView) => void): () => void;
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
    public async sendChat(payload: ChatSendPayload, options?: RepositoryRequestOptions): Promise<ChatView> {
        const chat = await this.requestRemote<ChatView>(
            ref => this.chatRemoteDataSource.sendChat(payload, ref),
            options
        );
        await this.chatLocalDataSource.upsertChat(chat, this.getRepositoryContext());
        return chat;
    }

    /** 메시지 피드 조회를 data source에 위임하고 응답을 기다립니다. */
    public async fetchChat(payload: ChatFeedPayload, options?: RepositoryRequestOptions): Promise<ChatFeedResult> {
        const policy = this.resolveCachePolicy(options);
        if (policy === 'network-only') {
            return this.fetchFromRemoteAndCache(payload, options);
        }

        const local = await this.chatLocalDataSource.fetchChat(payload, this.getRepositoryContext());
        if (policy === 'cache-only') {
            return (
                local ??
                ({
                    list: [],
                    cursorNo: 0,
                    limit: payload.limit,
                    readNo: 0,
                    total: 0,
                } as ChatFeedResult)
            );
        }

        if (local) {
            this.runInBackground(
                () => this.fetchFromRemoteAndCache(payload, { ...options, cachePolicy: 'network-only' }),
                'chat:cache-and-network-refresh'
            );
            return local;
        }

        return this.fetchFromRemoteAndCache(payload, options);
    }

    /**
     * 새로운 채팅 메시지(chat:create) 수신 이벤트를 구독합니다.
     */
    public onChatCreated(callback: (chat: ChatView) => void): () => void {
        return this.onDomainEvent('chat:create', detail => {
            callback(detail.data as ChatView);
        });
    }

    private resolveCachePolicy(
        options?: RepositoryRequestOptions
    ): NonNullable<RepositoryRequestOptions['cachePolicy']> {
        if (options?.cachePolicy) return options.cachePolicy;
        return 'cache-and-network';
    }

    private async fetchFromRemoteAndCache(
        payload: ChatFeedPayload,
        options?: RepositoryRequestOptions
    ): Promise<ChatFeedResult> {
        const remote = await this.requestRemote<ChatFeedResult>(
            ref => this.chatRemoteDataSource.fetchChat(payload, ref),
            options
        );
        await this.chatLocalDataSource.upsertChats(remote.list || [], this.getRepositoryContext());
        return remote;
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

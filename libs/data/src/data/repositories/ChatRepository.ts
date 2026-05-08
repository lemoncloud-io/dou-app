import type { ChatFeedPayload, ChatSendPayload } from '@lemoncloud/chatic-sockets-api';
import type { IChatLocalDataSource } from '../local/data-sources';
import type { IChatRemoteDataSource } from '../remote/data-sources';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
import type {
    DataContextProvider,
    ILocalCacheMutationRepository,
    LocalCacheBulkPatch,
    RepositoryRequestOptions,
} from './types';
import { BaseRepository } from './types';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';
import type { DomainChat, DomainChatFeedResult } from '../domain';
import { toDomainChat } from '../domain';
import type { ChatFeedResult, ChatView } from '@lemoncloud/chatic-socials-api';

/** 채팅 메시지 도메인의 Repository 공개 계약입니다. */
export interface IChatRepository extends ILocalCacheMutationRepository<DomainChat> {
    /** 서버의 chat:send 요청을 수행합니다. */
    sendChat(payload: ChatSendPayload, options?: RepositoryRequestOptions): Promise<DomainChat>;

    /** 서버의 chat:feed 요청을 수행하여 채널의 메시지 피드를 조회합니다. */
    fetchChat(payload: ChatFeedPayload, options?: RepositoryRequestOptions): Promise<DomainChatFeedResult>;

    /** 현재 스코프의 chat 로컬 캐시를 초기화합니다. */
    clearAll(): Promise<void>;

    /** 새로운 채팅 메시지(chat:create) 수신 이벤트를 구독합니다.
     * @param callback 수신된 채팅 데이터를 처리할 콜백 함수
     * @returns 구독 해제(unsubscribe) 함수
     */
    onChatCreated(callback: (chat: DomainChat) => void): () => void;

    /** 기존 채팅 메시지 변경(chat:update) 이벤트를 구독합니다. */
    onChatUpdated(callback: (chat: DomainChat) => void): () => void;

    /** 채팅 메시지 삭제(chat:delete) 이벤트를 구독합니다. */
    onChatDeleted(callback: (chat: DomainChat) => void): () => void;

    /** 로컬 캐시 기준 채널 feed를 스트림으로 구독합니다. */
    subscribeChatFeed(payload: ChatFeedPayload, callback: (result: DomainChatFeedResult | null) => void): () => void;

    /** 로컬 캐시 기준 단일 메시지를 스트림으로 구독합니다. */
    subscribeChat(id: string, callback: (chat: DomainChat | null) => void): () => void;
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
        const chat = await this.requestRemote<ChatView>(
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
            isLocalValid: local => {
                // cursorNo=0은 "더 가져올 원격 데이터 없음" 상태이므로 빈 목록도 유효 캐시로 취급합니다.
                if ((payload as { cursorNo?: number }).cursorNo === 0) return true;
                return (local.list || []).length > 0;
            },
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

    /** 현재 스코프의 chat 로컬 캐시를 초기화합니다. */
    public clearAll(): Promise<void> {
        return this.chatLocalDataSource.clearAll(this.getRepositoryContext());
    }

    /**
     * 새로운 채팅 메시지(chat:create) 수신 이벤트를 구독합니다.
     */
    public onChatCreated(callback: (chat: DomainChat) => void): () => void {
        return this.onDomainEvent('chat:create', detail => {
            const domainChat = toDomainChat(detail.data, this.getDomainScope());
            callback(domainChat);
        });
    }

    /**
     * 기존 채팅 메시지 변경(chat:update) 이벤트를 구독합니다.
     */
    public onChatUpdated(callback: (chat: DomainChat) => void): () => void {
        return this.onDomainEvent('chat:update', detail => {
            const domainChat = toDomainChat(detail.data, this.getDomainScope());
            callback(domainChat);
        });
    }

    /**
     * 채팅 메시지 삭제(chat:delete) 이벤트를 구독합니다.
     */
    public onChatDeleted(callback: (chat: DomainChat) => void): () => void {
        return this.onDomainEvent('chat:delete', detail => {
            const domainChat = toDomainChat(detail.data, this.getDomainScope());
            callback(domainChat);
        });
    }

    /** 로컬 채팅 feed 스냅샷을 지속 구독합니다. */
    public subscribeChatFeed(
        payload: ChatFeedPayload,
        callback: (result: DomainChatFeedResult | null) => void
    ): () => void {
        return this.chatLocalDataSource.subscribeChatFeed(payload, callback, this.getRepositoryContext());
    }

    /** 로컬 단일 메시지 스냅샷을 지속 구독합니다. */
    public subscribeChat(id: string, callback: (chat: DomainChat | null) => void): () => void {
        return this.chatLocalDataSource.subscribeChat(id, callback, this.getRepositoryContext());
    }

    /** 로컬 캐시에 메시지를 생성/병합합니다. (remote 호출 없음) */
    public cacheCreate(item: Partial<DomainChat>): Promise<void> {
        return this.chatLocalDataSource.upsertChat(item, this.getRepositoryContext());
    }

    /** 로컬 캐시의 메시지 일부 필드를 갱신합니다. (remote 호출 없음) */
    public cacheUpdate(id: string, patch: Partial<DomainChat>): Promise<void> {
        return this.chatLocalDataSource.updateChatPartial(id, patch, this.getRepositoryContext());
    }

    /** 로컬 캐시에서 메시지를 삭제합니다. (remote 호출 없음) */
    public cacheDelete(id: string): Promise<void> {
        return this.chatLocalDataSource.deleteChat(id, this.getRepositoryContext());
    }

    /** 로컬 캐시에 메시지를 일괄 생성/병합합니다. (remote 호출 없음) */
    public cacheBulkCreate(items: Array<Partial<DomainChat>>): Promise<void> {
        return this.chatLocalDataSource.upsertChats(items, this.getRepositoryContext());
    }

    /** 로컬 캐시의 메시지 일부 필드를 일괄 갱신합니다. (remote 호출 없음) */
    public async cacheBulkUpdate(items: Array<LocalCacheBulkPatch<DomainChat>>): Promise<void> {
        await Promise.all(
            items
                .filter(item => !!item.id)
                .map(item =>
                    this.chatLocalDataSource.updateChatPartial(item.id, item.patch, this.getRepositoryContext())
                )
        );
    }

    private async fetchFromRemoteAndCache(
        payload: ChatFeedPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainChatFeedResult> {
        const remote = await this.requestRemote<ChatFeedResult>(
            ref => this.chatRemoteDataSource.fetchChat(payload, ref),
            options
        );
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

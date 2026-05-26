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
import type ISyncRepository from './types';
import { BaseRepository } from './types';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';
import {
    createDomainListResult,
    type DomainChat,
    type DomainListResult,
    type DomainScope,
    toDomainChat,
} from '../domain';
import type { ChatFeedResult, ChatView } from '@lemoncloud/chatic-socials-api';

/** 채팅 메시지 도메인의 Repository 공개 계약입니다. */
export interface IChatRepository extends ILocalCacheMutationRepository<DomainChat> {
    /** 서버의 chat:send 요청을 수행합니다. */
    sendChat(payload: ChatSendPayload, options?: RepositoryRequestOptions): Promise<DomainChat>;

    /** 서버의 chat:feed 요청을 수행하여 채널의 메시지 피드를 조회합니다. */
    fetchChat(payload: ChatFeedPayload, options?: RepositoryRequestOptions): Promise<DomainListResult<DomainChat>>;

    /** 현재 스코프의 chat 로컬 캐시를 초기화합니다. */
    clearAll(): Promise<void>;

    /** 특정 채널의 chat 로컬 캐시를 삭제합니다. */
    clearByChannelId(channelId: string): Promise<void>;

    /** 새로운 채팅 메시지(chat:create) 수신 이벤트를 구독합니다.
     * @param callback 수신된 채팅 데이터를 처리할 콜백 함수
     * @returns 구독 해제(unsubscribe) 함수
     */
    onChatCreated(callback: (chat: DomainChat) => void): () => void;

    /** 기존 채팅 메시지 변경(chat:update) 이벤트를 구독합니다. */
    onChatUpdated(callback: (chat: DomainChat) => void): () => void;

    /** 채팅 메시지 삭제(chat:delete) 이벤트를 구독합니다. */
    onChatDeleted(callback: (chat: DomainChat) => void): () => void;

    /** 공통 스트림: 로컬 캐시 기준 채널의 메시지 배열을 스트림으로 구독합니다. */
    subscribeList(channelId: string, callback: (result: DomainListResult<DomainChat> | null) => void): () => void;

    /** 공통 스트림: 로컬 캐시 기준 단일 메시지를 스트림으로 구독합니다. */
    subscribeItem(id: string, callback: (chat: DomainChat | null) => void): () => void;
}

/** Remote chat API와 local message cache를 중재합니다. */
export class ChatRepository extends BaseRepository implements IChatRepository, ISyncRepository {
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
    sync(id?: string, meta?: Record<string, unknown>): Promise<void> {
        throw new Error('Method not implemented.');
    }

    /** 메시지 발신을 data source에 위임하고 응답을 기다립니다. */
    public async sendChat(payload: ChatSendPayload, options?: RepositoryRequestOptions): Promise<DomainChat> {
        const requestRef = options?.ref ?? `chat-send-${Date.now()}`;
        const requestOptions: RepositoryRequestOptions = { ...options, ref: requestRef };
        const repositoryContext = this.getRepositoryContext();
        const domainScope = this.getDomainScope();

        const optimisticChat = this.createOptimisticChat(payload, `optimistic-${requestRef}`, domainScope);
        await this.chatLocalDataSource.upsert(optimisticChat, repositoryContext);

        try {
            const chat = await this.requestRemote<ChatView>(
                ref => this.chatRemoteDataSource.sendChat(payload, ref),
                requestOptions
            );

            const domainChat = toDomainChat(
                {
                    ...chat,
                    tempId: optimisticChat.id,
                    isPending: false,
                    isFailed: false,
                },
                domainScope
            );

            await this.chatLocalDataSource.upsert(domainChat, repositoryContext);
            if (domainChat.id && optimisticChat.id !== domainChat.id) {
                await this.chatLocalDataSource.remove(optimisticChat.id, repositoryContext);
            }
            return domainChat;
        } catch (error) {
            const failedAt = Date.now();
            await this.chatLocalDataSource.upsert(
                {
                    ...optimisticChat,
                    isPending: false,
                    isFailed: true,
                    updatedAt: failedAt,
                },
                repositoryContext
            );
            throw error;
        }
    }

    /**
     * 캐시 우선 + 백그라운드 동기화 전략으로 메시지 피드를 조회합니다.
     */
    public async fetchChat(
        payload: ChatFeedPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainChat>> {
        const cachePolicy = options?.cachePolicy ?? 'cache-first';

        // 'network-only' 정책일 경우, 즉시 원격 조회를 실행하고 반환합니다.
        if (cachePolicy === 'network-only') {
            return this.fetchFromRemoteAndCache(payload, options);
        }

        // 1. 로컬 캐시에서 페이지를 먼저 조회합니다.
        const localResult = await this.chatLocalDataSource.fetchList(payload, this.getRepositoryContext());
        const isLocalPageValid = localResult !== null && localResult.list.length > 0;

        // 백그라운드에서 원격 동기화를 실행합니다.
        // cache-first 또는 cache-and-network 정책일 때 백그라운드 동기화를 시도합니다.
        if (isLocalPageValid) {
            // 로컬에 유효한 데이터가 있으면 즉시 반환하되, 정책에 따라 백그라운드 동기화를 스케줄링합니다.
            if (cachePolicy === 'cache-first' || cachePolicy === 'cache-and-network') {
                this.runInBackground(
                    () => this.fetchFromRemoteAndCache(payload, { ...options, ref: `${options?.ref}-bg-sync` }),
                    `bg-sync-chat-feed`
                );
            }
            return localResult;
        } else {
            // 로컬에 데이터가 없으면 중복 방지를 위해 백그라운드 동기화를 생략하고, 즉시 원격 데이터를 가져와 반환합니다.
            return this.fetchFromRemoteAndCache(payload, options);
        }
    }

    /** 현재 스코프의 chat 로컬 캐시를 초기화합니다. */
    public clearAll(): Promise<void> {
        return this.chatLocalDataSource.clearAll(this.getRepositoryContext());
    }

    /** 특정 채널의 chat 로컬 캐시를 삭제합니다. */
    public clearByChannelId(channelId: string): Promise<void> {
        return this.chatLocalDataSource.clearByChannelId(channelId, this.getRepositoryContext());
    }

    public onChatCreated(callback: (chat: DomainChat) => void): () => void {
        return this.onDomainEvent('chat:create', detail => {
            callback(toDomainChat(detail.data, this.getDomainScope()));
        });
    }

    public onChatUpdated(callback: (chat: DomainChat) => void): () => void {
        return this.onDomainEvent('chat:update', detail => {
            callback(toDomainChat(detail.data, this.getDomainScope()));
        });
    }

    public onChatDeleted(callback: (chat: DomainChat) => void): () => void {
        return this.onDomainEvent('chat:delete', detail => {
            callback(toDomainChat(detail.data, this.getDomainScope()));
        });
    }

    /** 공통 스트림: 로컬 채팅 목록 스냅샷을 지속 구독합니다. */
    public subscribeList(
        channelId: string,
        callback: (result: DomainListResult<DomainChat> | null) => void
    ): () => void {
        return this.chatLocalDataSource.subscribeList(channelId, callback, this.getRepositoryContext());
    }

    /** 공통 스트림: 로컬 단일 메시지 스냅샷을 지속 구독합니다. */
    public subscribeItem(id: string, callback: (chat: DomainChat | null) => void): () => void {
        return this.chatLocalDataSource.subscribeItem(id, callback, this.getRepositoryContext());
    }

    /** 로컬 캐시에 메시지를 생성/병합합니다. (remote 호출 없음) */
    public cacheCreate(item: Partial<DomainChat>): Promise<void> {
        return this.chatLocalDataSource.upsert(item, this.getRepositoryContext());
    }

    /** 로컬 캐시의 메시지 일부 필드를 갱신합니다. (remote 호출 없음) */
    public cacheUpdate(id: string, patch: Partial<DomainChat>): Promise<void> {
        return this.chatLocalDataSource.upsert({ id, ...patch }, this.getRepositoryContext());
    }

    /** 로컬 캐시에서 메시지를 삭제합니다. (remote 호출 없음) */
    public cacheDelete(id: string): Promise<void> {
        return this.chatLocalDataSource.remove(id, this.getRepositoryContext());
    }

    /** 로컬 캐시에 메시지를 일괄 생성/병합합니다. (remote 호출 없음) */
    public cacheBulkCreate(items: Array<Partial<DomainChat>>): Promise<void> {
        return this.chatLocalDataSource.upsertMany(items, this.getRepositoryContext());
    }

    /** 로컬 캐시의 메시지 일부 필드를 일괄 갱신합니다. (remote 호출 없음) */
    public async cacheBulkUpdate(items: Array<LocalCacheBulkPatch<DomainChat>>): Promise<void> {
        await Promise.all(
            items
                .filter(item => !!item.id)
                .map(item =>
                    this.chatLocalDataSource.upsert({ id: item.id, ...item.patch }, this.getRepositoryContext())
                )
        );
    }

    private async fetchFromRemoteAndCache(
        payload: ChatFeedPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainChat>> {
        const requestScope = this.getDomainScope();
        const requestContext = this.getRepositoryContext();

        const remote = await this.requestRemote<ChatFeedResult>(
            ref => this.chatRemoteDataSource.fetchChat(payload, ref),
            options
        );
        if (!remote) {
            return createDomainListResult([], {
                cursorNo: 0,
                readNo: 0,
                limit: payload.limit,
                total: 0,
                source: 'remote',
            });
        }
        const domainList = ((remote.list || []) as any[]).map(item => toDomainChat(item, requestScope));

        // cloud가 전환되었으면 캐시 저장 스킵 — cross-cloud 오염 방지
        const currentCid = this.getRepositoryContext().cid;
        if (currentCid === requestContext.cid) {
            await this.chatLocalDataSource.upsertMany(domainList, requestContext);
        }

        return createDomainListResult(domainList, {
            cursorNo: remote.cursorNo,
            readNo: remote.readNo,
            limit: payload.limit,
            total: remote.total ?? domainList.length,
            source: 'remote',
        });
    }

    private initializeInternalListeners(): void {
        this.onDomainEvent('chat:create', detail => {
            this.runInBackground(
                () => this.chatLocalDataSource.upsert(detail.data, this.getRepositoryContext()),
                'chat:create'
            );
        });
        this.onDomainEvent('chat:update', detail => {
            this.runInBackground(
                () => this.chatLocalDataSource.upsert(detail.data, this.getRepositoryContext()),
                'chat:update'
            );
        });
        this.onDomainEvent('chat:delete', detail => {
            this.runInBackground(
                () => this.chatLocalDataSource.remove(detail.data.id || '', this.getRepositoryContext()),
                'chat:delete'
            );
        });
        // NOTE: chat:list 캐시 저장은 fetchFromRemoteAndCache에서 요청 시점 context를 캡처하여 처리함.
        // 여기서 중복 upsertMany를 수행하면 cloud 전환 중 도착한 이전 cloud 응답이
        // 현재 cloud의 캐시 파티션에 저장되는 cross-cloud 오염이 발생함.

        // 채널 삭제 시 해당 채널의 chat 캐시도 함께 정리
        this.onDomainEvent('channel:delete', detail => {
            const channelId = detail.data.id || '';
            if (channelId) {
                this.runInBackground(
                    () => this.chatLocalDataSource.clearByChannelId(channelId, this.getRepositoryContext()),
                    'channel:delete→chat:clear'
                );
            }
        });
    }

    private createOptimisticChat(payload: ChatSendPayload, id: string, domainScope: DomainScope): DomainChat {
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
                chatNo: Number.MAX_SAFE_INTEGER, // 낙관적 메시지가 항상 가장 아래에 오도록 가장 큰 chatNo 설정
            } as Partial<DomainChat>,
            domainScope
        );
    }
}

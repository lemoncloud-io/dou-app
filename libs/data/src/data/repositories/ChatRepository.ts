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
import { createDomainListResult, type DomainChat, type DomainListResult } from '../domain';
import { toDomainChat } from '../domain';
import type { ChatFeedResult, ChatView } from '@lemoncloud/chatic-socials-api';

/** 채팅 메시지 도메인의 Repository 공개 계약입니다. */
export interface IChatRepository extends ILocalCacheMutationRepository<DomainChat> {
    /** 서버의 chat:send 요청을 수행합니다. */
    sendChat(payload: ChatSendPayload, options?: RepositoryRequestOptions): Promise<DomainChat>;

    /** 서버의 chat:feed 요청을 수행하여 채널의 메시지 피드를 조회합니다. */
    fetchChat(payload: ChatFeedPayload, options?: RepositoryRequestOptions): Promise<DomainListResult<DomainChat>>;

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

    /** 공통 스트림: 로컬 캐시 기준 채널의 메시지 배열을 스트림으로 구독합니다. */
    subscribeList(channelId: string, callback: (result: DomainListResult<DomainChat> | null) => void): () => void;

    /** 공통 스트림: 로컬 캐시 기준 단일 메시지를 스트림으로 구독합니다. */
    subscribeItem(id: string, callback: (chat: DomainChat | null) => void): () => void;
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
        await this.chatLocalDataSource.upsert(domainChat, this.getRepositoryContext());
        return domainChat;
    }

    /** 메시지 피드 조회를 data source에 위임하고 응답을 기다립니다. */
    public async fetchChat(
        payload: ChatFeedPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainChat>> {
        return this.fetchWithCachePolicy<DomainListResult<DomainChat>>({
            options,
            backgroundLabel: 'chat',
            fetchLocal: async () => {
                const channelId = payload.channelId;
                if (!channelId) return null;

                // Chat은 cursor 연속성이 깨진 캐시를 신뢰하지 않고 remote를 우선합니다.
                const continuity = await this.chatLocalDataSource.checkContinuity(
                    channelId,
                    this.getRepositoryContext()
                );
                if (continuity.hasGap) return null;

                const localResult = await this.chatLocalDataSource.fetchList(channelId, this.getRepositoryContext());

                // 💡 수정: 데이터가 없더라도 cursorNo가 0일 때는 "유효한 초기 빈 캐시"로 판단하여 null이 아닌 빈 리스트 객체 반환
                if (!localResult || localResult.list.length === 0) {
                    if ((payload as { cursorNo?: number }).cursorNo === 0) {
                        return createDomainListResult([], {
                            cursorNo: 0,
                            limit: payload.limit,
                            readNo: 0,
                            total: 0,
                            source: 'local',
                        });
                    }
                    return null;
                }

                // 💡 메타데이터 분리 규격
                return createDomainListResult(localResult.list, {
                    ...localResult.meta,
                    cursorNo: 0,
                    limit: payload.limit,
                    readNo: 0,
                    source: 'local',
                });
            },
            fetchRemote: remoteOptions => this.fetchFromRemoteAndCache(payload, remoteOptions),
            isLocalValid: local => {
                // cursorNo가 0이면 항상 유효한 것으로 판정
                if ((payload as { cursorNo?: number }).cursorNo === 0) return true;
                return (local.list || []).length > 0;
            },
            fallback: () =>
                createDomainListResult([], {
                    cursorNo: 0,
                    limit: payload.limit,
                    readNo: 0,
                    total: 0,
                    source: 'fallback',
                }),
        });
    }

    /** 현재 스코프의 chat 로컬 캐시를 초기화합니다. */
    public clearAll(): Promise<void> {
        return this.chatLocalDataSource.clearAll(this.getRepositoryContext());
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
        const remote = await this.requestRemote<ChatFeedResult>(
            ref => this.chatRemoteDataSource.fetchChat(payload, ref),
            options
        );
        const domainList = ((remote?.list || []) as any[]).map(item => toDomainChat(item, this.getDomainScope()));
        await this.chatLocalDataSource.upsertMany(domainList, this.getRepositoryContext());

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
        this.onDomainEvent('chat:list', detail => {
            this.runInBackground(
                () => this.chatLocalDataSource.upsertMany(detail.data.list || [], this.getRepositoryContext()),
                'chat:list'
            );
        });
    }
}

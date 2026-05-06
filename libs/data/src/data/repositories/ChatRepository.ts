import type { ChatFeedResult, ChatView } from '@lemoncloud/chatic-socials-api';
import type { ChatFeedPayload, ChatSendPayload } from '@lemoncloud/chatic-sockets-api';
import type { IChatLocalDataSource } from '../local/data-sources';
import type { IChatRemoteDataSource } from '../remote/data-sources';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
import type { RepositoryRequestOptions } from './types';
import { BaseRepository, type RepositoryContextProvider } from './types';
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
        context: RepositoryContextProvider,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(requestManager, context, domainEventBus);
    }

    /** 메시지 발신을 data source에 위임하고 응답을 기다립니다. */
    public sendChat(payload: ChatSendPayload, options?: RepositoryRequestOptions): Promise<ChatView> {
        return this.requestRemote(ref => this.chatRemoteDataSource.sendChat(payload, ref), options);
    }

    /** 메시지 피드 조회를 data source에 위임하고 응답을 기다립니다. */
    public fetchChat(payload: ChatFeedPayload, options?: RepositoryRequestOptions): Promise<ChatFeedResult> {
        return this.requestRemote(ref => this.chatRemoteDataSource.fetchChat(payload, ref), options);
    }

    /**
     * 새로운 채팅 메시지(chat:create) 수신 이벤트를 구독합니다.
     */
    public onChatCreated(callback: (chat: ChatView) => void): () => void {
        return this.onDomainEvent('chat:create', data => {
            callback(data as ChatView);
        });
    }
}

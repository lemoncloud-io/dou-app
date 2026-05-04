import type { ChatFeedResult, ChatView } from '@lemoncloud/chatic-socials-api';
import type { ChatFeedPayload, ChatSendPayload } from '@lemoncloud/chatic-sockets-api';
import type { IChatRemoteDataSource } from '../remote/data-sources';
import type { SocketRequestManager } from '../remote/sockets/SocketRequestManager';
import { BaseRepository, type RepositoryRequestOptions, type RepositoryRuntime } from './types';

/**
 * 채팅 메시지 도메인의 Repository 공개 계약입니다.
 * 화면은 메시지 발신/피드 조회를 이 API로만 수행하고 소켓 세부 구현에는 접근하지 않습니다.
 */
export interface IChatRepository {
    /** 서버의 chat:send 요청을 수행합니다. */
    sendChat(payload: ChatSendPayload, options?: RepositoryRequestOptions): Promise<ChatView>;

    /** 서버의 chat:feed 요청을 수행하여 채널의 메시지 피드를 조회합니다. */
    fetchChat(payload: ChatFeedPayload, options?: RepositoryRequestOptions): Promise<ChatFeedResult>;
}

/**
 * ChatRemoteDataSource를 감싸는 채팅 Repository 구현체입니다.
 * domain event 내부 구독은 BaseRepository의 protected API로만 사용할 수 있습니다.
 */
export class ChatRepository extends BaseRepository implements IChatRepository {
    constructor(
        private readonly chatDataSource: IChatRemoteDataSource,
        requestManager: SocketRequestManager,
        runtime?: RepositoryRuntime
    ) {
        super(requestManager, runtime);
    }

    /** 메시지 발신을 data source에 위임하고 응답을 기다립니다. */
    public sendChat(payload: ChatSendPayload, options?: RepositoryRequestOptions): Promise<ChatView> {
        return this.requestRemote(ref => this.chatDataSource.sendChat(payload, ref), options);
    }

    /** 메시지 피드 조회를 data source에 위임하고 응답을 기다립니다. */
    public fetchChat(payload: ChatFeedPayload, options?: RepositoryRequestOptions): Promise<ChatFeedResult> {
        return this.requestRemote(ref => this.chatDataSource.fetchChat(payload, ref), options);
    }
}

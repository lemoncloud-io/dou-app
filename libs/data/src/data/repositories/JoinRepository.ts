import type { JoinView } from '@lemoncloud/chatic-socials-api';
import type { ChatReadPayload, ChatUpdateJoinPayload } from '@lemoncloud/chatic-sockets-api';
import type { IJoinLocalDataSource } from '../local/data-sources';
import type { IJoinRemoteDataSource } from '../remote/data-sources';
import { BaseRepository, type RepositoryContextProvider, type RepositoryRequestOptions } from './types';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
import type { DomainEventMap } from '../events/domain';
import type { IEventBus } from '../events/eventBus';

/** 채널 참여 상태(join) 도메인의 Repository 공개 계약입니다. */
export interface IJoinRepository {
    /** 특정 채팅 번호까지 읽었음을 서버에 알립니다. */
    readChat(payload: ChatReadPayload, options?: RepositoryRequestOptions): Promise<JoinView>;

    /** 알림 설정, 닉네임 등 채널 참여 정보를 갱신합니다. */
    updateJoin(payload: ChatUpdateJoinPayload, options?: RepositoryRequestOptions): Promise<JoinView>;

    /** 서버로부터 참여 정보 생성(join:create) 이벤트를 수신하는 리스너를 등록합니다. */
    onJoinCreated(callback: (join: JoinView) => void): () => void;

    /** 서버로부터 참여 정보 변경(join:update) 이벤트를 수신하는 리스너를 등록합니다. */
    onJoinUpdated(callback: (join: JoinView) => void): () => void;

    /** 서버로부터 참여 정보 삭제(join:delete) 이벤트를 수신하는 리스너를 등록합니다. */
    onJoinDeleted(callback: (join: JoinView) => void): () => void;
}

/** Remote join API와 local join cache를 중재합니다. */
export class JoinRepository extends BaseRepository implements IJoinRepository {
    constructor(
        private readonly joinRemoteDataSource: IJoinRemoteDataSource,
        private readonly joinLocalDataSource: IJoinLocalDataSource,
        requestManager: ISocketRequestManager,
        context: RepositoryContextProvider,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(requestManager, context, domainEventBus);
    }

    /** chat:read 요청을 수행하고 응답을 기다립니다. */
    public readChat(payload: ChatReadPayload, options?: RepositoryRequestOptions): Promise<JoinView> {
        return this.requestRemote(ref => this.joinRemoteDataSource.readChat(payload, ref), options);
    }

    /** chat:update-join 요청을 수행하고 응답을 기다립니다. */
    public updateJoin(payload: ChatUpdateJoinPayload, options?: RepositoryRequestOptions): Promise<JoinView> {
        return this.requestRemote(ref => this.joinRemoteDataSource.updateJoin(payload, ref), options);
    }

    /** 서버로부터 참여 정보 생성(join:create) 이벤트를 수신하는 리스너를 등록합니다. */
    public onJoinCreated(callback: (join: JoinView) => void): () => void {
        return this.onDomainEvent('join:create', data => {
            callback(data as JoinView);
        });
    }

    /** 서버로부터 참여 정보 변경(join:update) 이벤트를 수신하는 리스너를 등록합니다. */
    public onJoinUpdated(callback: (join: JoinView) => void): () => void {
        return this.onDomainEvent('join:update', data => {
            callback(data as JoinView);
        });
    }

    /** 서버로부터 참여 정보 삭제(join:delete) 이벤트를 수신하는 리스너를 등록합니다. */
    public onJoinDeleted(callback: (join: JoinView) => void): () => void {
        return this.onDomainEvent('join:delete', data => {
            callback(data as JoinView);
        });
    }
}

import type { JoinView } from '@lemoncloud/chatic-socials-api';
import type { ChatReadPayload, ChatUpdateJoinPayload } from '@lemoncloud/chatic-sockets-api';
import type { IJoinRemoteDataSource } from '../remote/data-sources';
import type { SocketRequestManager } from '../remote/sockets/SocketRequestManager';
import { BaseRepository, type RepositoryRequestOptions, type RepositoryRuntime } from './types';

/**
 * 채널 참여 상태(join) 도메인의 Repository 공개 계약입니다.
 * 읽음 처리와 참여 설정 변경을 담당합니다.
 */
export interface IJoinRepository {
    /** 특정 채팅 번호까지 읽었음을 서버에 알립니다. */
    readChat(payload: ChatReadPayload, options?: RepositoryRequestOptions): Promise<JoinView>;
    /** 알림 설정, 닉네임 등 채널 참여 정보를 갱신합니다. */
    updateJoin(payload: ChatUpdateJoinPayload, options?: RepositoryRequestOptions): Promise<JoinView>;
}

/**
 * JoinRemoteDataSource를 감싸는 join Repository 구현체입니다.
 */
export class JoinRepository extends BaseRepository implements IJoinRepository {
    constructor(
        private readonly joinDataSource: IJoinRemoteDataSource,
        requestManager: SocketRequestManager,
        runtime?: RepositoryRuntime
    ) {
        super(requestManager, runtime);
    }

    /** chat:read 요청을 수행하고 응답을 기다립니다. */
    public readChat(payload: ChatReadPayload, options?: RepositoryRequestOptions): Promise<JoinView> {
        return this.requestRemote(ref => this.joinDataSource.readChat(payload, ref), options);
    }

    /** chat:update-join 요청을 수행하고 응답을 기다립니다. */
    public updateJoin(payload: ChatUpdateJoinPayload, options?: RepositoryRequestOptions): Promise<JoinView> {
        return this.requestRemote(ref => this.joinDataSource.updateJoin(payload, ref), options);
    }
}

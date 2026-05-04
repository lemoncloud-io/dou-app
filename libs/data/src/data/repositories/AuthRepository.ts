import type { AuthPayload } from '@lemoncloud/chatic-sockets-api';
import type { IAuthRemoteDataSource } from '../remote/data-sources';
import type { SocketRequestManager } from '../remote/sockets/SocketRequestManager';
import { RepositoryBase, requestRemote, type RepositoryRequestOptions, type RepositoryRuntime } from './types';

/**
 * 인증 도메인의 Repository 공개 계약입니다.
 * UI/Hook 계층은 RemoteDataSource나 SocketRequestManager 대신 이 인터페이스만 의존합니다.
 */
export interface IAuthRepository {
    /**
     * 현재 소켓 연결에 인증 정보를 갱신하도록 요청합니다.
     * 서버 응답은 auth:update domain event로 돌아오며 requestRemote가 ref 기준으로 Promise를 완료합니다.
     */
    updateSocketAuth(payload?: AuthPayload, options?: RepositoryRequestOptions): Promise<AuthPayload>;
}

/**
 * AuthRemoteDataSource를 감싸는 인증 Repository 구현체입니다.
 * 이 클래스는 발신 정책(ref/timeout)만 담당하고, 소켓 전송 자체는 data source에 위임합니다.
 */
export class AuthRepository extends RepositoryBase implements IAuthRepository {
    constructor(
        private readonly authDataSource: IAuthRemoteDataSource,
        private readonly requestManager: SocketRequestManager,
        runtime?: RepositoryRuntime
    ) {
        super(runtime);
    }

    /**
     * 인증 payload가 없을 때도 data source에는 빈 객체를 전달해 서버 요청 형태를 일정하게 유지합니다.
     */
    public updateSocketAuth(payload?: AuthPayload, options?: RepositoryRequestOptions): Promise<AuthPayload> {
        const remotePayload = payload ?? {};
        return requestRemote(
            this.requestManager,
            ref => this.authDataSource.updateSocketAuth(remotePayload, ref),
            options
        );
    }
}

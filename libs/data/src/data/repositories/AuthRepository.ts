import type { AuthUpdateInput } from '@lemoncloud/chatic-sockets-api';
import type { IAuthRemoteDataSource } from '../remote/data-sources';
import type { DataContextProvider, RepositoryRequestOptions } from './types';
import { BaseRepository } from './types';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';
import type { AuthUpdateResponse } from '@lemoncloud/chatic-sockets-api/dist/lib/auth/types';

/**
 * 인증 도메인의 Repository 공개 계약입니다.
 * UI/Hook 계층은 RemoteDataSource 대신 이 인터페이스만 의존합니다.
 */
export interface IAuthRepository {
    /**
     * 현재 소켓 연결에 인증 정보를 갱신하도록 요청합니다.
     */
    updateSocketAuth(payload?: AuthUpdateInput, options?: RepositoryRequestOptions): Promise<AuthUpdateResponse>;
}

/**
 * AuthRemoteDataSource를 감싸는 인증 Repository 구현체입니다.
 */
export class AuthRepository extends BaseRepository implements IAuthRepository {
    private static readonly TAG = 'AuthRepository';

    constructor(
        private readonly authRemoteDataSource: IAuthRemoteDataSource,
        contextProvider: DataContextProvider,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(contextProvider, domainEventBus);
        this.initializeInternalListeners();
    }

    /**
     * 인증 payload가 없을 때도 data source에는 빈 객체를 전달해 서버 요청 형태를 일정하게 유지합니다.
     */
    public async updateSocketAuth(
        payload?: AuthUpdateInput,
        options?: RepositoryRequestOptions
    ): Promise<AuthUpdateResponse> {
        const remotePayload = payload ?? {};

        return await this.authRemoteDataSource.updateSocketAuth(remotePayload);
    }

    private initializeInternalListeners(): void {
        this.onDomainEvent('auth:create', detail => {
            console.log(`[${AuthRepository.TAG}] auth:create`, detail.data);
        });

        this.onDomainEvent('auth:update', detail => {
            console.log(`[${AuthRepository.TAG}] auth:update`, detail.data);
        });

        this.onDomainEvent('auth:delete', detail => {
            console.log(`[${AuthRepository.TAG}] auth:delete`, detail.data);
        });
    }
}

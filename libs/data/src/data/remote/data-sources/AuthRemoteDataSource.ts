import type { ISocketClient } from '../sockets';
import type { AuthUpdateInput } from '@lemoncloud/chatic-sockets-api';
import type { AuthUpdateResponse } from '@lemoncloud/chatic-sockets-api/dist/lib/auth/types';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';

export interface IAuthRemoteDataSource {
    /** 서버에 인증 정보(토큰 등) 업데이트를 요청합니다. */
    updateSocketAuth(payload: AuthUpdateInput): Promise<AuthUpdateResponse>;

    /** 인바운드 모델 이벤트를 처리합니다. */
    handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void;
}

export class AuthRemoteDataSource implements IAuthRemoteDataSource {
    constructor(
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly client: ISocketClient
    ) {}

    public async updateSocketAuth(payload: AuthUpdateInput): Promise<AuthUpdateResponse> {
        return this.client.request('auth.update', payload);
    }

    public handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void {
        const eventName = `auth:${action}` as 'auth:create' | 'auth:update' | 'auth:delete';
        this.domainEventBus.emit(eventName, {
            data,
        });
    }
}

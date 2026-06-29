import type { AuthUpdateInput } from '@lemoncloud/chatic-sockets-api';
import type { AuthUpdateResponse } from '@lemoncloud/chatic-sockets-api/dist/lib/auth/types';
import type { AuthDomainGateway } from '../gateways';

export interface IAuthRemoteDataSource {
    /** 서버에 인증 정보(토큰 등) 업데이트를 요청합니다. */
    updateSocketAuth(payload: AuthUpdateInput): Promise<AuthUpdateResponse>;
}

export class AuthRemoteDataSource implements IAuthRemoteDataSource {
    constructor(private readonly gateway: AuthDomainGateway) {}

    public async updateSocketAuth(payload: AuthUpdateInput): Promise<AuthUpdateResponse> {
        return this.gateway.update(payload);
    }
}

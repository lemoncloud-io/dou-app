import type { ISocketClient } from '../sockets/clients/clients';
import type { AuthUpdateInput } from '@lemoncloud/chatic-sockets-api';

export interface IAuthRemoteDataSource {
    /** 서버에 인증 정보(토큰 등) 업데이트를 요청합니다. */
    updateSocketAuth(payload: AuthUpdateInput): Promise<unknown>;
}

export class AuthRemoteDataSource implements IAuthRemoteDataSource {
    constructor(private readonly client: ISocketClient) {}

    public async updateSocketAuth(payload: AuthUpdateInput): Promise<unknown> {
        return this.client.request('auth.update', payload);
    }
}

import { AuthRemoteDataSource } from './AuthRemoteDataSource';
import { MockSocketClient } from '../sockets/__mocks__/MockSocketClient';
import type { AuthUpdateInput } from '@lemoncloud/chatic-sockets-api';

describe('AuthRemoteDataSource', () => {
    let mockClient: MockSocketClient;
    let dataSource: AuthRemoteDataSource;

    beforeEach(() => {
        mockClient = new MockSocketClient();
        dataSource = new AuthRemoteDataSource(mockClient);
    });

    it('updateSocketAuth 호출 시 auth.update 액션으로 request가 전송되어야 한다', async () => {
        const payload: AuthUpdateInput = { token: 'new-token' } as any;
        mockClient.request.mockResolvedValue({ status: 'ok' });

        const result = await dataSource.updateSocketAuth(payload);

        expect(mockClient.request).toHaveBeenCalledWith('auth.update', payload);
        expect(result).toEqual({ status: 'ok' });
    });
});

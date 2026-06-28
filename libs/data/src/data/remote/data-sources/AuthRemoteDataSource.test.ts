import { AuthRemoteDataSource } from './AuthRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { AuthUpdateInput } from '@lemoncloud/chatic-sockets-api';
describe('AuthRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let dataSource: AuthRemoteDataSource;

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        dataSource = new AuthRemoteDataSource(mockGateways.auth);
    });

    it('updateSocketAuth 호출 시 auth.update 액션으로 request가 전송되어야 한다', async () => {
        const payload: AuthUpdateInput = { token: 'new-token' } as any;
        mockGateways.auth.update.mockResolvedValue({ status: 'ok' } as any);

        const result = await dataSource.updateSocketAuth(payload);

        expect(mockGateways.auth.update).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ status: 'ok' });
    });
});

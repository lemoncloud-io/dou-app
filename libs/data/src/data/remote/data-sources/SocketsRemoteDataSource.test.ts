import { SocketsRemoteDataSource } from './SocketsRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { SocketsFindConnectionInput } from '@lemoncloud/chatic-sockets-api';

describe('SocketsRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let dataSource: SocketsRemoteDataSource;

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        dataSource = new SocketsRemoteDataSource(mockGateways.sockets);
    });

    it('findConnection 호출 시 sockets.find-connection 액션으로 request가 전송되어야 한다', async () => {
        const payload: SocketsFindConnectionInput = { event: { connectionId: 'conn-1' } } as any;
        mockGateways.sockets.request.mockResolvedValue({ connectionId: 'conn-1', connectedAt: 123456 } as any);

        const result = await dataSource.findConnection(payload);

        expect(mockGateways.sockets.request).toHaveBeenCalledWith('find-connection', payload);
        expect(result).toEqual({ connectionId: 'conn-1', connectedAt: 123456 });
    });
});

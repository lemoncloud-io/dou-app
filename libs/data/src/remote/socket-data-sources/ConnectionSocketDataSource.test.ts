import { ConnectionSocketDataSource } from './ConnectionSocketDataSource';
import { createMockSocketGateways, type MockSocketGatewayBundle } from '../gateways/__mocks__/MockSocketGateways';
import type { SocketsFindConnectionInput } from '@lemoncloud/chatic-sockets-api';

describe('ConnectionSocketDataSource', () => {
    let mockGateways: MockSocketGatewayBundle;
    let dataSource: ConnectionSocketDataSource;

    beforeEach(() => {
        mockGateways = createMockSocketGateways();
        dataSource = new ConnectionSocketDataSource(mockGateways.connection);
    });

    it('findConnection 호출 시 sockets.find-connection 액션으로 request가 전송되어야 한다', async () => {
        const payload: SocketsFindConnectionInput = { event: { connectionId: 'conn-1' } } as any;
        mockGateways.connection.request.mockResolvedValue({ connectionId: 'conn-1', connectedAt: 123456 } as any);

        const result = await dataSource.findConnection(payload);

        expect(mockGateways.connection.request).toHaveBeenCalledWith('find-connection', payload);
        expect(result).toEqual({ connectionId: 'conn-1', connectedAt: 123456 });
    });
});

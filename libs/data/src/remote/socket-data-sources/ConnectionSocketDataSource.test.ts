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

    it('findConnection sends the request as the sockets.find-connection action', async () => {
        const payload: SocketsFindConnectionInput = { event: { connectionId: 'conn-1' } } as any;
        mockGateways.connection.request.mockResolvedValue({ connectionId: 'conn-1', connectedAt: 123456 } as any);

        const result = await dataSource.findConnection(payload);

        expect(mockGateways.connection.request).toHaveBeenCalledWith('find-connection', payload);
        expect(result).toEqual({ connectionId: 'conn-1', connectedAt: 123456 });
    });
});

import { SocketsRemoteDataSource } from './SocketsRemoteDataSource';
import { MockSocketClient } from '../sockets/__mocks__/MockSocketClient';
import type { SocketsFindConnectionInput } from '@lemoncloud/chatic-sockets-api';

describe('SocketsRemoteDataSource', () => {
    let mockClient: MockSocketClient;
    let dataSource: SocketsRemoteDataSource;

    beforeEach(() => {
        mockClient = new MockSocketClient();
        dataSource = new SocketsRemoteDataSource(mockClient);
    });

    it('findConnection 호출 시 sockets.find-connection 액션으로 request가 전송되어야 한다', async () => {
        const payload: SocketsFindConnectionInput = { event: { connectionId: 'conn-1' } } as any;
        mockClient.request.mockResolvedValue({ connectionId: 'conn-1', connectedAt: 123456 });

        const result = await dataSource.findConnection(payload);

        expect(mockClient.request).toHaveBeenCalledWith('sockets.find-connection', payload);
        expect(result).toEqual({ connectionId: 'conn-1', connectedAt: 123456 });
    });
});

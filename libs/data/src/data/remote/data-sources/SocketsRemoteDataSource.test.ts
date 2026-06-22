import { SocketsRemoteDataSource } from './SocketsRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { SocketsFindConnectionInput } from '@lemoncloud/chatic-sockets-api';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';

describe('SocketsRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let mockEventBus: jest.Mocked<IEventBus<DomainEventMap>>;
    let dataSource: SocketsRemoteDataSource;

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        mockEventBus = { emit: jest.fn(), on: jest.fn(), off: jest.fn() } as any;
        dataSource = new SocketsRemoteDataSource(mockEventBus, mockGateways.sockets);
    });

    it('findConnection 호출 시 sockets.find-connection 액션으로 request가 전송되어야 한다', async () => {
        const payload: SocketsFindConnectionInput = { event: { connectionId: 'conn-1' } } as any;
        mockGateways.sockets.request.mockResolvedValue({ connectionId: 'conn-1', connectedAt: 123456 } as any);

        const result = await dataSource.findConnection(payload);

        expect(mockGateways.sockets.request).toHaveBeenCalledWith('find-connection', payload);
        expect(result).toEqual({ connectionId: 'conn-1', connectedAt: 123456 });
    });

    it('handleSocketModelEvent("create", data) 호출 시 domainEventBus에 socket:create를 emit 해야 한다', () => {
        const data = { id: 'socket-1' };
        dataSource.handleSocketModelEvent('create', data);
        expect(mockEventBus.emit).toHaveBeenCalledWith('socket:create', { data });
    });

    it('handleSocketModelEvent("update", data) 호출 시 domainEventBus에 socket:update를 emit 해야 한다', () => {
        const data = { id: 'socket-1' };
        dataSource.handleSocketModelEvent('update', data);
        expect(mockEventBus.emit).toHaveBeenCalledWith('socket:update', { data });
    });

    it('handleConnectionModelEvent("create", data) 호출 시 domainEventBus에 connection:create를 emit 해야 한다', () => {
        const data = { id: 'conn-1' };
        dataSource.handleConnectionModelEvent('create', data);
        expect(mockEventBus.emit).toHaveBeenCalledWith('connection:create', { data });
    });

    it('handleConnectionModelEvent("update", data) 호출 시 domainEventBus에 connection:update를 emit 해야 한다', () => {
        const data = { id: 'conn-1' };
        dataSource.handleConnectionModelEvent('update', data);
        expect(mockEventBus.emit).toHaveBeenCalledWith('connection:update', { data });
    });

    it('handleConnectionModelEvent("delete", data) 호출 시 domainEventBus에 connection:delete를 emit 해야 한다', () => {
        const data = { id: 'conn-1' };
        dataSource.handleConnectionModelEvent('delete', data);
        expect(mockEventBus.emit).toHaveBeenCalledWith('connection:delete', { data });
    });
});

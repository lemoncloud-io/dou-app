import { SocketDispatcher } from './dispatchers';
import { MockSocketClient } from '../__mocks__/MockSocketClient';
import type {
    IChannelRemoteDataSource,
    IChatRemoteDataSource,
    IJoinRemoteDataSource,
    IUserRemoteDataSource,
    IAuthRemoteDataSource,
    IDeviceRemoteDataSource,
    ISocketsRemoteDataSource,
} from '../../../data-sources';

describe('SocketDispatcher', () => {
    let mockClient: MockSocketClient;
    let mockChannelDS: jest.Mocked<IChannelRemoteDataSource>;
    let mockChatDS: jest.Mocked<IChatRemoteDataSource>;
    let mockJoinDS: jest.Mocked<IJoinRemoteDataSource>;
    let mockUserDS: jest.Mocked<IUserRemoteDataSource>;
    let mockAuthDS: jest.Mocked<IAuthRemoteDataSource>;
    let mockDeviceDS: jest.Mocked<IDeviceRemoteDataSource>;
    let mockSocketsDS: jest.Mocked<ISocketsRemoteDataSource>;
    let dispatcher: SocketDispatcher;

    beforeEach(() => {
        mockClient = new MockSocketClient();

        mockChannelDS = { handleModelEvent: jest.fn() } as any;
        mockChatDS = { handleModelEvent: jest.fn() } as any;
        mockJoinDS = { handleModelEvent: jest.fn() } as any;
        mockUserDS = { handleModelEvent: jest.fn() } as any;
        mockAuthDS = { handleModelEvent: jest.fn() } as any;
        mockDeviceDS = { handleModelEvent: jest.fn() } as any;
        mockSocketsDS = { handleSocketModelEvent: jest.fn(), handleConnectionModelEvent: jest.fn() } as any;

        dispatcher = new SocketDispatcher(
            mockClient,
            mockChannelDS,
            mockChatDS,
            mockJoinDS,
            mockUserDS,
            mockAuthDS,
            mockDeviceDS,
            mockSocketsDS
        );
    });

    afterEach(() => {
        dispatcher.destroy();
    });

    it('should route model.create event to appropriate data source', () => {
        const chatMsg = {
            type: 'model.create',
            data: { type: 'chat', id: 'chat-1' },
        };

        mockClient._simulateIncomingMessage(chatMsg);

        expect(mockChatDS.handleModelEvent).toHaveBeenCalledWith('create', chatMsg.data);
        expect(mockChannelDS.handleModelEvent).not.toHaveBeenCalled();
    });

    it('should route model.update event to appropriate data source', () => {
        const channelMsg = {
            type: 'model.update',
            data: { type: 'channel', id: 'channel-1' },
        };

        mockClient._simulateIncomingMessage(channelMsg);

        expect(mockChannelDS.handleModelEvent).toHaveBeenCalledWith('update', channelMsg.data);
        expect(mockChatDS.handleModelEvent).not.toHaveBeenCalled();
    });

    it('should route model.delete event to appropriate data source', () => {
        const joinMsg = {
            type: 'model.delete',
            data: { type: 'join', id: 'join-1' },
        };

        mockClient._simulateIncomingMessage(joinMsg);

        expect(mockJoinDS.handleModelEvent).toHaveBeenCalledWith('delete', joinMsg.data);
        expect(mockChatDS.handleModelEvent).not.toHaveBeenCalled();
    });

    it('should route auth model event to authRemoteDataSource', () => {
        const authMsg = {
            type: 'model.update',
            data: { type: 'auth', id: 'auth-1' },
        };

        mockClient._simulateIncomingMessage(authMsg);

        expect(mockAuthDS.handleModelEvent).toHaveBeenCalledWith('update', authMsg.data);
    });

    it('should route device model event to deviceRemoteDataSource', () => {
        const deviceMsg = {
            type: 'model.create',
            data: { type: 'device', id: 'device-1' },
        };

        mockClient._simulateIncomingMessage(deviceMsg);

        expect(mockDeviceDS.handleModelEvent).toHaveBeenCalledWith('create', deviceMsg.data);
    });

    it('should route socket model event to socketsRemoteDataSource.handleSocketModelEvent', () => {
        const socketMsg = {
            type: 'model.update',
            data: { type: 'socket', id: 'socket-1' },
        };

        mockClient._simulateIncomingMessage(socketMsg);

        expect(mockSocketsDS.handleSocketModelEvent).toHaveBeenCalledWith('update', socketMsg.data);
    });

    it('should route connection model event to socketsRemoteDataSource.handleConnectionModelEvent', () => {
        const connectionMsg = {
            type: 'model.create',
            data: { type: 'connection', id: 'conn-1' },
        };

        mockClient._simulateIncomingMessage(connectionMsg);

        expect(mockSocketsDS.handleConnectionModelEvent).toHaveBeenCalledWith('create', connectionMsg.data);
    });

    it('should warn for unhandled model types (mock, test, callback)', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

        const mockMsg = {
            type: 'model.create',
            data: { type: 'mock', id: 'mock-1' },
        };

        mockClient._simulateIncomingMessage(mockMsg);

        expect(warnSpy).toHaveBeenCalledWith('[SocketDispatcher] unhandled model type: "mock"');
        warnSpy.mockRestore();
    });

    it('should warn for unknown model types', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

        const unknownMsg = {
            type: 'model.update',
            data: { type: 'unknown-type', id: 'x-1' },
        };

        mockClient._simulateIncomingMessage(unknownMsg);

        expect(warnSpy).toHaveBeenCalledWith('[SocketDispatcher] unknown model type: "unknown-type"');
        warnSpy.mockRestore();
    });
});

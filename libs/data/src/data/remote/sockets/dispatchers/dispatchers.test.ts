import { SocketDispatcher } from './dispatchers';
import { MockSocketClient } from '../__mocks__/MockSocketClient';
import type {
    IChannelRemoteDataSource,
    IChatRemoteDataSource,
    IJoinRemoteDataSource,
    ISiteRemoteDataSource,
    IUserRemoteDataSource,
} from '../../../data-sources';

describe('SocketDispatcher', () => {
    let mockClient: MockSocketClient;
    let mockChannelDS: jest.Mocked<IChannelRemoteDataSource>;
    let mockChatDS: jest.Mocked<IChatRemoteDataSource>;
    let mockJoinDS: jest.Mocked<IJoinRemoteDataSource>;
    let mockSiteDS: jest.Mocked<ISiteRemoteDataSource>;
    let mockUserDS: jest.Mocked<IUserRemoteDataSource>;
    let dispatcher: SocketDispatcher;

    beforeEach(() => {
        mockClient = new MockSocketClient();

        mockChannelDS = { handleModelEvent: jest.fn() } as any;
        mockChatDS = { handleModelEvent: jest.fn() } as any;
        mockJoinDS = { handleModelEvent: jest.fn() } as any;
        mockSiteDS = { handleModelEvent: jest.fn() } as any;
        mockUserDS = { handleModelEvent: jest.fn() } as any;

        dispatcher = new SocketDispatcher(mockClient, mockChannelDS, mockChatDS, mockJoinDS, mockSiteDS, mockUserDS);
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
});

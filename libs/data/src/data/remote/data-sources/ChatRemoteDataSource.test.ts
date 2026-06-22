import { ChatRemoteDataSource } from './ChatRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
import type { ChatFeedInput, ChatSendInput } from '@lemoncloud/chatic-sockets-api';

describe('ChatRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let mockDomainEventBus: jest.Mocked<IEventBus<DomainEventMap>>;
    let dataSource: ChatRemoteDataSource;

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        mockDomainEventBus = {
            emit: jest.fn(),
            on: jest.fn(),
            onAny: jest.fn(),
        } as unknown as jest.Mocked<IEventBus<DomainEventMap>>;

        dataSource = new ChatRemoteDataSource(mockDomainEventBus, mockGateways.chat);
    });

    it('sendChat 호출 시 chat.send 액션으로 request가 전송되어야 한다', async () => {
        const payload: ChatSendInput = {
            channelId: 'ch-1',
            content: 'hello',
            contentType: 'text',
        };
        await dataSource.sendChat(payload);
        expect(mockGateways.chat.send).toHaveBeenCalledWith(payload);
    });

    it('fetchChat 호출 시 chat.feed 액션으로 request가 전송되어야 한다', async () => {
        const payload: ChatFeedInput = {
            channelId: 'ch-1',
            limit: 20,
        };
        await dataSource.fetchChat(payload);
        expect(mockGateways.chat.feed).toHaveBeenCalledWith(payload);
    });

    it('handleModelEvent("create", data) 호출 시 chat:create를 emit 해야 한다', () => {
        const data = { id: 'msg-1', content: 'hello' };
        dataSource.handleModelEvent('create', data);
        expect(mockDomainEventBus.emit).toHaveBeenCalledWith('chat:create', { data });
    });
});

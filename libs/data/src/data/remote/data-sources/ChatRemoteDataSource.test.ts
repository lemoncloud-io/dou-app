import { ChatRemoteDataSource } from './ChatRemoteDataSource';
import { MockSocketClient } from '../sockets/__mocks__/MockSocketClient';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
import type { ChatFeedInput, ChatSendInput } from '@lemoncloud/chatic-sockets-api';

describe('ChatRemoteDataSource', () => {
    let mockClient: MockSocketClient;
    let mockDomainEventBus: jest.Mocked<IEventBus<DomainEventMap>>;
    let dataSource: ChatRemoteDataSource;

    beforeEach(() => {
        mockClient = new MockSocketClient();
        mockDomainEventBus = {
            emit: jest.fn(),
            on: jest.fn(),
            onAny: jest.fn(),
        } as unknown as jest.Mocked<IEventBus<DomainEventMap>>;

        dataSource = new ChatRemoteDataSource(mockDomainEventBus, mockClient);
    });

    it('sendChat 호출 시 chat.send 액션으로 request가 전송되어야 한다', async () => {
        const payload: ChatSendInput = {
            channelId: 'ch-1',
            content: 'hello',
            contentType: 'text',
        };
        await dataSource.sendChat(payload);
        expect(mockClient.request).toHaveBeenCalledWith('chat.send', payload);
    });

    it('fetchChat 호출 시 chat.feed 액션으로 request가 전송되어야 한다', async () => {
        const payload: ChatFeedInput = {
            channelId: 'ch-1',
            limit: 20,
        };
        await dataSource.fetchChat(payload);
        expect(mockClient.request).toHaveBeenCalledWith('chat.feed', payload);
    });

    it('handleModelEvent("create", data) 호출 시 chat:create를 emit 해야 한다', () => {
        const data = { id: 'msg-1', content: 'hello' };
        dataSource.handleModelEvent('create', data);
        expect(mockDomainEventBus.emit).toHaveBeenCalledWith('chat:create', { data });
    });
});

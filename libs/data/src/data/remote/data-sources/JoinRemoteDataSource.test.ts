import { JoinRemoteDataSource } from './JoinRemoteDataSource';
import { MockSocketClient } from '../sockets/__mocks__/MockSocketClient';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
import type { ChannelJoinInput, ChannelUpdateJoinInput, ChatReadInput } from '@lemoncloud/chatic-sockets-api';

describe('JoinRemoteDataSource', () => {
    let mockClient: MockSocketClient;
    let mockDomainEventBus: jest.Mocked<IEventBus<DomainEventMap>>;
    let dataSource: JoinRemoteDataSource;

    beforeEach(() => {
        mockClient = new MockSocketClient();
        mockDomainEventBus = {
            emit: jest.fn(),
            on: jest.fn(),
            onAny: jest.fn(),
        } as unknown as jest.Mocked<IEventBus<DomainEventMap>>;

        dataSource = new JoinRemoteDataSource(mockDomainEventBus, mockClient);
    });

    it('readChat 호출 시 chat.read 액션으로 request가 전송되어야 한다', async () => {
        const payload: ChatReadInput = { channelId: 'ch-1', readNo: 5 } as any;
        await dataSource.readChat(payload);
        expect(mockClient.request).toHaveBeenCalledWith('chat.read', payload);
    });

    it('updateJoin 호출 시 channel.update-join 액션으로 request가 전송되어야 한다', async () => {
        const payload: ChannelUpdateJoinInput = { channelId: 'ch-1', nick: 'new-nick' };
        await dataSource.updateJoin(payload);
        expect(mockClient.request).toHaveBeenCalledWith('channel.update-join', payload);
    });

    it('joinChannel 호출 시 channel.join 액션으로 request가 전송되어야 한다', async () => {
        const payload: ChannelJoinInput = { channelId: 'ch-1' };
        await dataSource.joinChannel(payload);
        expect(mockClient.request).toHaveBeenCalledWith('channel.join', payload);
    });

    it('handleModelEvent("update", data) 호출 시 join:update를 emit 해야 한다', () => {
        const data = { id: 'join-1', nick: 'new-nick' };
        dataSource.handleModelEvent('update', data);
        expect(mockDomainEventBus.emit).toHaveBeenCalledWith('join:update', { data });
    });
});

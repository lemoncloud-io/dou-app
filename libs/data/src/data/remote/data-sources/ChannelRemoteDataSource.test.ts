import { ChannelRemoteDataSource } from './ChannelRemoteDataSource';
import { MockSocketClient } from '../sockets/__mocks__/MockSocketClient';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
import type {
    ChatMineInput,
    ChannelSyncInput,
    ChatUpdateChannelInput,
    ChatDeleteChannelInput,
    ChatStartInput,
    ChatInviteInput,
    ChatLeaveInput,
    ChannelGetSelfInput,
    ChannelUnreadsInput,
} from '@lemoncloud/chatic-sockets-api';

describe('ChannelRemoteDataSource', () => {
    let mockClient: MockSocketClient;
    let mockDomainEventBus: jest.Mocked<IEventBus<DomainEventMap>>;
    let dataSource: ChannelRemoteDataSource;

    beforeEach(() => {
        mockClient = new MockSocketClient();
        mockDomainEventBus = {
            emit: jest.fn(),
            on: jest.fn(),
            onAny: jest.fn(),
        } as unknown as jest.Mocked<IEventBus<DomainEventMap>>;

        dataSource = new ChannelRemoteDataSource(mockDomainEventBus, mockClient);
    });

    describe('발신(Send) 파이프라인 검증 (Request)', () => {
        it('fetchChannel 호출 시 channel.mine 액션으로 request를 전송해야 한다', async () => {
            const payload: ChatMineInput = { limit: 20 } as any;
            await dataSource.fetchChannel(payload);
            expect(mockClient.request).toHaveBeenCalledWith('channel.mine', payload);
        });

        it('syncChannel 호출 시 channel.sync 액션으로 request를 전송해야 한다', async () => {
            const payload: ChannelSyncInput = { since: 123456 };
            await dataSource.syncChannel(payload);
            expect(mockClient.request).toHaveBeenCalledWith('channel.sync', payload);
        });

        it('updateChannel 호출 시 channel.update 액션으로 request를 전송해야 한다', async () => {
            const payload: ChatUpdateChannelInput = { channelId: 'ch-1', name: 'New Name' } as any;
            await dataSource.updateChannel(payload);
            expect(mockClient.request).toHaveBeenCalledWith('channel.update', payload);
        });

        it('deleteChannel 호출 시 channel.delete 액션으로 request를 전송해야 한다', async () => {
            const payload: ChatDeleteChannelInput = { channelId: 'ch-1' } as any;
            await dataSource.deleteChannel(payload);
            expect(mockClient.request).toHaveBeenCalledWith('channel.delete', payload);
        });

        it('createChannel 호출 시 channel.create 액션으로 request를 전송해야 한다', async () => {
            const payload: ChatStartInput = { stereo: 'group', name: 'General' } as any;
            await dataSource.createChannel(payload);
            expect(mockClient.request).toHaveBeenCalledWith('channel.create', payload);
        });

        it('inviteChannel 호출 시 channel.invite 액션으로 request를 전송해야 한다', async () => {
            const payload: ChatInviteInput = { channelId: 'ch-1', userIds: ['user-2'] } as any;
            await dataSource.inviteChannel(payload);
            expect(mockClient.request).toHaveBeenCalledWith('channel.invite', payload);
        });

        it('leaveChannel 호출 시 channel.leave 액션으로 request를 전송해야 한다', async () => {
            const payload: ChatLeaveInput = { channelId: 'ch-1' } as any;
            await dataSource.leaveChannel(payload);
            expect(mockClient.request).toHaveBeenCalledWith('channel.leave', payload);
        });

        it('getSelfChannel 호출 시 channel.get-self 액션으로 request를 전송해야 한다', async () => {
            const payload: ChannelGetSelfInput = {};
            await dataSource.getSelfChannel(payload);
            expect(mockClient.request).toHaveBeenCalledWith('channel.get-self', payload);
        });

        it('getUnreads 호출 시 channel.unreads 액션으로 request를 전송해야 한다', async () => {
            const payload: ChannelUnreadsInput = {};
            await dataSource.getUnreads(payload);
            expect(mockClient.request).toHaveBeenCalledWith('channel.unreads', payload);
        });
    });

    describe('수신(Receive) 파이프라인 검증 (Model Event)', () => {
        it('handleModelEvent("create", data) 호출 시 domainEventBus에 channel:create를 emit 해야 한다', () => {
            const data = { id: 'ch-1', name: 'General' };
            dataSource.handleModelEvent('create', data);
            expect(mockDomainEventBus.emit).toHaveBeenCalledWith('channel:create', { data });
        });

        it('handleModelEvent("update", data) 호출 시 domainEventBus에 channel:update를 emit 해야 한다', () => {
            const data = { id: 'ch-1', name: 'General V2' };
            dataSource.handleModelEvent('update', data);
            expect(mockDomainEventBus.emit).toHaveBeenCalledWith('channel:update', { data });
        });

        it('handleModelEvent("delete", data) 호출 시 domainEventBus에 channel:delete를 emit 해야 한다', () => {
            const data = { id: 'ch-1' };
            dataSource.handleModelEvent('delete', data);
            expect(mockDomainEventBus.emit).toHaveBeenCalledWith('channel:delete', { data });
        });
    });
});

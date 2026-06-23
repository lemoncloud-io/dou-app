import { ChannelRemoteDataSource } from './ChannelRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
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
    let mockGateways: MockRemoteGatewayBundle;
    let dataSource: ChannelRemoteDataSource;

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        dataSource = new ChannelRemoteDataSource(mockGateways.channel);
    });

    describe('발신(Send) 파이프라인 검증 (Request)', () => {
        it('fetchChannel 호출 시 channel.mine 액션으로 request를 전송해야 한다', async () => {
            const payload: ChatMineInput = { limit: 20 } as any;
            await dataSource.fetchChannel(payload);
            expect(mockGateways.channel.mine).toHaveBeenCalledWith(payload);
        });

        it('syncChannel 호출 시 channel.sync 액션으로 request를 전송해야 한다', async () => {
            const payload: ChannelSyncInput = { since: 123456 };
            await dataSource.syncChannel(payload);
            expect(mockGateways.channel.sync).toHaveBeenCalledWith(payload);
        });

        it('updateChannel 호출 시 channel.update 액션으로 request를 전송해야 한다', async () => {
            const payload: ChatUpdateChannelInput = { channelId: 'ch-1', name: 'New Name' } as any;
            await dataSource.updateChannel(payload);
            expect(mockGateways.channel.update).toHaveBeenCalledWith(payload);
        });

        it('deleteChannel 호출 시 channel.delete 액션으로 request를 전송해야 한다', async () => {
            const payload: ChatDeleteChannelInput = { channelId: 'ch-1' } as any;
            await dataSource.deleteChannel(payload);
            expect(mockGateways.channel.delete).toHaveBeenCalledWith(payload);
        });

        it('createChannel 호출 시 channel.create 액션으로 request를 전송해야 한다', async () => {
            const payload: ChatStartInput = { stereo: 'group', name: 'General' } as any;
            await dataSource.createChannel(payload);
            expect(mockGateways.channel.create).toHaveBeenCalledWith(payload);
        });

        it('inviteChannel 호출 시 channel.invite 액션으로 request를 전송해야 한다', async () => {
            const payload: ChatInviteInput = { channelId: 'ch-1', userIds: ['user-2'] } as any;
            await dataSource.inviteChannel(payload);
            expect(mockGateways.channel.invite).toHaveBeenCalledWith(payload);
        });

        it('leaveChannel 호출 시 channel.leave 액션으로 request를 전송해야 한다', async () => {
            const payload: ChatLeaveInput = { channelId: 'ch-1' } as any;
            await dataSource.leaveChannel(payload);
            expect(mockGateways.channel.leave).toHaveBeenCalledWith(payload);
        });

        it('getSelfChannel 호출 시 channel.get-self 액션으로 request를 전송해야 한다', async () => {
            const payload: ChannelGetSelfInput = {};
            await dataSource.getSelfChannel(payload);
            expect(mockGateways.channel.getSelf).toHaveBeenCalledWith(payload);
        });

        it('getUnreads 호출 시 channel.unreads 액션으로 request를 전송해야 한다', async () => {
            const payload: ChannelUnreadsInput = {};
            await dataSource.getUnreads(payload);
            expect(mockGateways.channel.unreads).toHaveBeenCalledWith(payload);
        });
    });
});

import { ChannelRemoteDataSource } from './ChannelRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { DataContext } from '../../repositories-v2/types';
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
    const context: DataContext = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        dataSource = new ChannelRemoteDataSource(mockGateways.channel);
    });

    describe('발신(Send) 파이프라인 검증 (Request)', () => {
        it('fetchChannel 호출 시 channel.mine 액션으로 request를 전송해야 한다', async () => {
            const payload: ChatMineInput = { limit: 20 } as any;
            await dataSource.fetchChannel(payload, context);
            expect(mockGateways.channel.mine).toHaveBeenCalledWith(payload);
        });

        it('syncChannel 호출 시 channel.sync 액션으로 request를 전송해야 한다', async () => {
            const payload: ChannelSyncInput = { since: 123456 };
            await dataSource.syncChannel(payload, context);
            expect(mockGateways.channel.sync).toHaveBeenCalledWith(payload);
        });

        it('updateChannel 호출 시 channel.update 액션으로 request를 전송해야 한다', async () => {
            const payload: ChatUpdateChannelInput = { channelId: 'ch-1', name: 'New Name' } as any;
            await dataSource.updateChannel(payload, context);
            expect(mockGateways.channel.update).toHaveBeenCalledWith(payload);
        });

        it('deleteChannel 호출 시 channel.delete 액션으로 request를 전송해야 한다', async () => {
            const payload: ChatDeleteChannelInput = { channelId: 'ch-1' } as any;
            await dataSource.deleteChannel(payload, context);
            expect(mockGateways.channel.delete).toHaveBeenCalledWith(payload);
        });

        it('createChannel 호출 시 channel.create 액션으로 request를 전송해야 한다', async () => {
            const payload: ChatStartInput = { stereo: 'group', name: 'General' } as any;
            await dataSource.createChannel(payload, context);
            expect(mockGateways.channel.create).toHaveBeenCalledWith(payload);
        });

        it('inviteChannel 호출 시 channel.invite 액션으로 request를 전송해야 한다', async () => {
            const payload: ChatInviteInput = { channelId: 'ch-1', userIds: ['user-2'] } as any;
            await dataSource.inviteChannel(payload, context);
            expect(mockGateways.channel.invite).toHaveBeenCalledWith(payload);
        });

        it('leaveChannel 호출 시 channel.leave 액션으로 request를 전송해야 한다', async () => {
            const payload: ChatLeaveInput = { channelId: 'ch-1' } as any;
            await dataSource.leaveChannel(payload, context);
            expect(mockGateways.channel.leave).toHaveBeenCalledWith(payload);
        });

        it('getSelfChannel 호출 시 channel.get-self 액션으로 request를 전송해야 한다', async () => {
            const payload: ChannelGetSelfInput = {};
            await dataSource.getSelfChannel(payload, context);
            expect(mockGateways.channel.getSelf).toHaveBeenCalledWith(payload);
        });

        it('getUnreads 호출 시 channel.unreads 액션으로 request를 전송해야 한다', async () => {
            const payload: ChannelUnreadsInput = {};
            await dataSource.getUnreads(payload);
            expect(mockGateways.channel.unreads).toHaveBeenCalledWith(payload);
        });
    });

    describe('수신(Receive) 매핑 검증 (View → Domain)', () => {
        it('fetchChannel 응답을 도메인 모델 목록으로 변환하고 context의 cid를 부여한다', async () => {
            (mockGateways.channel.mine as jest.Mock).mockResolvedValue({
                list: [{ id: 'ch-1', sid: 'site-1', updatedAt: 1000 }],
                total: 1,
            });

            const result = await dataSource.fetchChannel({} as any, context);

            expect(result.list).toHaveLength(1);
            expect(result.list[0]).toMatchObject({ id: 'ch-1', cid: 'cloud-a', sid: 'site-1' });
            expect(result.meta.source).toBe('remote');
        });

        it('createChannel 응답을 단일 도메인 채널로 변환한다', async () => {
            (mockGateways.channel.create as jest.Mock).mockResolvedValue({ id: 'ch-9', sid: 'site-1' });

            const domain = await dataSource.createChannel({} as any, context);

            expect(domain).toMatchObject({ id: 'ch-9', cid: 'cloud-a', sid: 'site-1' });
            expect(domain.isNotificationEnabled).toBe(true);
        });

        it('syncChannel 응답에서 도메인 목록과 ids/syncedAt 메타를 보존한다', async () => {
            (mockGateways.channel.sync as jest.Mock).mockResolvedValue({
                list: [{ id: 'ch-1', sid: 'site-1' }],
                ids: ['ch-1', 'ch-2'],
                syncedAt: 555,
            });

            const result = await dataSource.syncChannel({ since: 0 }, context);

            expect(result.list[0]).toMatchObject({ id: 'ch-1', cid: 'cloud-a' });
            expect(result.ids).toEqual(['ch-1', 'ch-2']);
            expect(result.syncedAt).toBe(555);
        });
    });
});

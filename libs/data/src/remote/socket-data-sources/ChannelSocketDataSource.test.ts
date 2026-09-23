import { ChannelSocketDataSource } from './ChannelSocketDataSource';
import { createMockSocketGateways, type MockSocketGatewayBundle } from '../gateways/__mocks__/MockSocketGateways';
import type { DataContext } from '../../repositories/types';
import type {
    ChatMineInput,
    ChannelSyncInput,
    ChatUpdateChannelInput,
    ChatDeleteChannelInput,
    ChatStartInput,
    ChatInviteInput,
    ChatLeaveInput,
    ChannelGetSelfInput,
} from '@lemoncloud/chatic-sockets-api';

describe('ChannelSocketDataSource', () => {
    let mockGateways: MockSocketGatewayBundle;
    let dataSource: ChannelSocketDataSource;
    const context: DataContext = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };

    beforeEach(() => {
        mockGateways = createMockSocketGateways();
        dataSource = new ChannelSocketDataSource(mockGateways.channel);
    });

    describe('outbound pipeline (Request)', () => {
        it('fetchChannel sends the request as the channel.mine action', async () => {
            const payload: ChatMineInput = { limit: 20 } as any;
            await dataSource.fetchChannel(payload, context);
            expect(mockGateways.channel.mine).toHaveBeenCalledWith(payload);
        });

        it('syncChannel sends the request as the channel.sync action', async () => {
            const payload: ChannelSyncInput = { since: 123456 };
            await dataSource.syncChannel(payload, context);
            expect(mockGateways.channel.sync).toHaveBeenCalledWith(payload);
        });

        it('updateChannel sends the request as the channel.update action', async () => {
            const payload: ChatUpdateChannelInput = { channelId: 'ch-1', name: 'New Name' } as any;
            await dataSource.updateChannel(payload, context);
            expect(mockGateways.channel.update).toHaveBeenCalledWith(payload);
        });

        it('deleteChannel sends the request as the channel.delete action', async () => {
            const payload: ChatDeleteChannelInput = { channelId: 'ch-1' } as any;
            await dataSource.deleteChannel(payload, context);
            expect(mockGateways.channel.delete).toHaveBeenCalledWith(payload);
        });

        it('createChannel sends the request as the channel.create action', async () => {
            const payload: ChatStartInput = { stereo: 'group', name: 'General' } as any;
            await dataSource.createChannel(payload, context);
            expect(mockGateways.channel.create).toHaveBeenCalledWith(payload);
        });

        it('inviteChannel sends the request as the channel.invite action', async () => {
            const payload: ChatInviteInput = { channelId: 'ch-1', userIds: ['user-2'] } as any;
            await dataSource.inviteChannel(payload, context);
            expect(mockGateways.channel.invite).toHaveBeenCalledWith(payload);
        });

        it('leaveChannel sends the request as the channel.leave action', async () => {
            const payload: ChatLeaveInput = { channelId: 'ch-1' } as any;
            await dataSource.leaveChannel(payload, context);
            expect(mockGateways.channel.leave).toHaveBeenCalledWith(payload);
        });

        it('getSelfChannel sends the request as the channel.get-self action', async () => {
            const payload: ChannelGetSelfInput = {};
            await dataSource.getSelfChannel(payload, context);
            expect(mockGateways.channel.getSelf).toHaveBeenCalledWith(payload);
        });
    });

    describe('inbound mapping (View → Domain)', () => {
        it('maps the fetchChannel response to domain models and stamps cid from the context', async () => {
            (mockGateways.channel.mine as jest.Mock).mockResolvedValue({
                list: [{ id: 'ch-1', sid: 'site-1', updatedAt: 1000 }],
                total: 1,
            });

            const result = await dataSource.fetchChannel({} as any, context);

            expect(result.list).toHaveLength(1);
            expect(result.list[0]).toMatchObject({ id: 'ch-1', cid: 'cloud-a', sid: 'site-1' });
            expect(result.meta.source).toBe('remote');
        });

        it('maps the createChannel response to a single domain channel', async () => {
            (mockGateways.channel.create as jest.Mock).mockResolvedValue({ id: 'ch-9', sid: 'site-1' });

            const domain = await dataSource.createChannel({} as any, context);

            expect(domain).toMatchObject({ id: 'ch-9', cid: 'cloud-a', sid: 'site-1' });
            expect(domain.isNotificationEnabled).toBe(true);
        });

        it('preserves the domain list and the ids/syncedAt metadata from the syncChannel response', async () => {
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

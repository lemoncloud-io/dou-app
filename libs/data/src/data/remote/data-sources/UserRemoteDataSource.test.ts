import { UserRemoteDataSource } from './UserRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { DataContext } from '../../repositories';
import type {
    ChannelSyncUsersInput,
    ChatUsersInput,
    UserInviteBatchInput,
    UserInviteInput,
    UserUpdateProfileInput,
} from '@lemoncloud/chatic-sockets-api';

describe('UserRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let dataSource: UserRemoteDataSource;
    const context: DataContext = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        dataSource = new UserRemoteDataSource(mockGateways.user);
    });

    describe('발신(Send) 파이프라인 검증 (Request)', () => {
        it('fetchUsers 호출 시 channel.list-user 액션으로 request가 전송되어야 한다', async () => {
            const payload: ChatUsersInput = { channelId: 'ch-1' } as any;
            await dataSource.fetchUsers(payload, context);
            expect(mockGateways.user.listUser).toHaveBeenCalledWith(payload);
        });

        it('updateProfile 호출 시 user.update-profile 액션으로 request가 전송되어야 한다', async () => {
            const payload: UserUpdateProfileInput = { name: 'New Name' };
            await dataSource.updateProfile(payload, context);
            expect(mockGateways.user.update).toHaveBeenCalledWith(payload);
        });

        it('requestInvite 호출 시 user.invite 액션으로 request가 전송되어야 한다', async () => {
            const payload: UserInviteInput = { name: 'Guest', phone: '01012345678' };
            await dataSource.requestInvite(payload);
            expect(mockGateways.user.invite).toHaveBeenCalledWith(payload);
        });

        it('inviteBatch 호출 시 user.invite-batch 액션으로 request가 전송되어야 한다', async () => {
            const payload: UserInviteBatchInput = { to: ['01012345678'] };
            await dataSource.inviteBatch(payload);
            expect(mockGateways.user.inviteBatch).toHaveBeenCalledWith(payload);
        });

        it('syncChannelUsers 호출 시 channel.sync-users 액션으로 request가 전송되어야 한다', async () => {
            const payload: ChannelSyncUsersInput = { channelId: 'ch-1' };
            await dataSource.syncChannelUsers(payload, context);
            expect(mockGateways.user.syncUsers).toHaveBeenCalledWith(payload);
        });
    });

    describe('수신(Receive) 매핑 검증 (View → Domain)', () => {
        it('fetchUsers 응답을 도메인 user 목록으로 변환하고 context의 cid를 부여한다', async () => {
            (mockGateways.user.listUser as jest.Mock).mockResolvedValue({
                list: [{ id: 'user-1', channelId: 'ch-1' }],
                total: 1,
            });

            const result = await dataSource.fetchUsers({ channelId: 'ch-1' } as any, context);

            expect(result.list[0]).toMatchObject({ id: 'user-1', cid: 'cloud-a' });
            expect(result.list[0].channelIds).toContain('ch-1');
            expect(result.meta.source).toBe('remote');
        });

        it('updateProfile 응답을 단일 도메인 user로 변환한다', async () => {
            (mockGateways.user.update as jest.Mock).mockResolvedValue({ id: 'user-1', name: 'New Name' });

            const domain = await dataSource.updateProfile({ name: 'New Name' }, context);

            expect(domain).toMatchObject({ id: 'user-1', cid: 'cloud-a' });
        });
    });
});

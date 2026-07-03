import { UserRemoteDataSource } from './UserRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { DataContext } from '../../repositories-v2/types';
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

        it('getMyProfile 호출 시 user.profile 액션으로 request가 전송되어야 한다', async () => {
            await dataSource.getMyProfile(context);
            expect(mockGateways.user.profile).toHaveBeenCalledTimes(1);
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

        it('getMyProfile: UserProfile$ 래퍼의 $user를 도메인 user로, $site를 도메인 place로 변환한다', async () => {
            (mockGateways.user.profile as jest.Mock).mockResolvedValue({
                uid: 'me',
                $user: { id: 'me', name: 'Me' },
                $site: { id: 'site-1', name: 'My Site' },
            });

            const { user, site } = await dataSource.getMyProfile(context);

            expect(user).toMatchObject({ id: 'me', cid: 'cloud-a' });
            expect(site).toMatchObject({ id: 'site-1', cid: 'cloud-a' });
        });

        it('getMyProfile: $site가 없으면 site는 null이다', async () => {
            (mockGateways.user.profile as jest.Mock).mockResolvedValue({ $user: { id: 'me' } });

            const { user, site } = await dataSource.getMyProfile(context);

            expect(user).toMatchObject({ id: 'me', cid: 'cloud-a' });
            expect(site).toBeNull();
        });

        it('getMyProfile: 응답이 평탄한 user view로 와도(또는 비어도) 안전하게 변환한다', async () => {
            (mockGateways.user.profile as jest.Mock).mockResolvedValue({ id: 'me', name: 'Me' });
            const flat = await dataSource.getMyProfile(context);
            expect(flat.user).toMatchObject({ id: 'me', cid: 'cloud-a' });
            expect(flat.site).toBeNull();

            (mockGateways.user.profile as jest.Mock).mockResolvedValue(undefined);
            const empty = await dataSource.getMyProfile(context);
            expect(empty.user).toMatchObject({ cid: 'cloud-a' });
            expect(empty.site).toBeNull();
        });

        it('updateProfile 응답을 단일 도메인 user로 변환한다', async () => {
            (mockGateways.user.update as jest.Mock).mockResolvedValue({ id: 'user-1', name: 'New Name' });

            const domain = await dataSource.updateProfile({ name: 'New Name' }, context);

            expect(domain).toMatchObject({ id: 'user-1', cid: 'cloud-a' });
        });

        it('syncChannelUsers 응답에서 user와 내장 $join을 분리해 변환하고 커서를 반환한다', async () => {
            (mockGateways.user.syncUsers as jest.Mock).mockResolvedValue({
                list: [
                    { id: 'u1', name: 'Alice', $join: { id: 'ch-1@u1', channelId: 'ch-1', userId: 'u1', chatNo: 9 } },
                    { id: 'u2', name: 'Bob' }, // join 없음 → joins에서 제외
                ],
                ids: ['u1', 'u2'],
                syncedAt: 1700,
            });

            const result = await dataSource.syncChannelUsers({ channelId: 'ch-1' } as any, context);

            expect(result.users.map(u => u.id)).toEqual(['u1', 'u2']);
            expect(result.joins).toHaveLength(1);
            expect(result.joins[0]).toMatchObject({ id: 'ch-1@u1', channelId: 'ch-1', userId: 'u1', cid: 'cloud-a' });
            expect(result.ids).toEqual(['u1', 'u2']);
            expect(result.syncedAt).toBe(1700);
        });

        it('$join에 channelId/userId가 없으면 요청 channelId와 부모 user id로 보강한다', async () => {
            (mockGateways.user.syncUsers as jest.Mock).mockResolvedValue({
                list: [{ id: 'u1', $join: { chatNo: 3 } }],
                ids: ['u1'],
                syncedAt: 1,
            });

            const result = await dataSource.syncChannelUsers({ channelId: 'ch-1' } as any, context);

            expect(result.joins[0]).toMatchObject({ id: 'ch-1@u1', channelId: 'ch-1', userId: 'u1' });
        });
    });
});

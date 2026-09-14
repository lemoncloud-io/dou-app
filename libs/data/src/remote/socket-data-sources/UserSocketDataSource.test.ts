import { UserSocketDataSource } from './UserSocketDataSource';
import { createMockSocketGateways, type MockSocketGatewayBundle } from '../gateways/__mocks__/MockSocketGateways';
import type { DataContext } from '../../repositories/types';
import type {
    ChannelSyncUsersInput,
    ChatUsersInput,
    UserInviteBatchInput,
    UserInviteInput,
    UserUpdateProfileInput,
} from '@lemoncloud/chatic-sockets-api';

describe('UserSocketDataSource', () => {
    let mockGateways: MockSocketGatewayBundle;
    let dataSource: UserSocketDataSource;
    const context: DataContext = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };

    beforeEach(() => {
        mockGateways = createMockSocketGateways();
        dataSource = new UserSocketDataSource(mockGateways.user);
    });

    describe('outbound pipeline (Request)', () => {
        it('fetchUsers sends the request as the channel.list-user action', async () => {
            const payload: ChatUsersInput = { channelId: 'ch-1' } as any;
            await dataSource.fetchUsers(payload, context);
            expect(mockGateways.user.listUser).toHaveBeenCalledWith(payload);
        });

        it('getMyProfile sends the request as the user.profile action', async () => {
            await dataSource.getMyProfile(context);
            expect(mockGateways.user.profile).toHaveBeenCalledTimes(1);
        });

        it('updateProfile sends the request as the user.update-profile action', async () => {
            const payload: UserUpdateProfileInput = { name: 'New Name' };
            await dataSource.updateProfile(payload, context);
            expect(mockGateways.user.update).toHaveBeenCalledWith(payload);
        });

        it('requestInvite sends the request as the user.invite action', async () => {
            const payload: UserInviteInput = { name: 'Guest', phone: '01012345678' };
            await dataSource.requestInvite(payload);
            expect(mockGateways.user.invite).toHaveBeenCalledWith(payload);
        });

        it('inviteBatch sends the request as the user.invite-batch action', async () => {
            const payload: UserInviteBatchInput = { to: ['01012345678'] };
            await dataSource.inviteBatch(payload);
            expect(mockGateways.user.inviteBatch).toHaveBeenCalledWith(payload);
        });

        it('syncChannelUsers sends the request as the channel.sync-users action', async () => {
            const payload: ChannelSyncUsersInput = { channelId: 'ch-1' };
            await dataSource.syncChannelUsers(payload, context);
            expect(mockGateways.user.syncUsers).toHaveBeenCalledWith(payload);
        });
    });

    describe('inbound mapping (View → Domain)', () => {
        it('maps the fetchUsers response to domain users and stamps cid from the context', async () => {
            (mockGateways.user.listUser as jest.Mock).mockResolvedValue({
                list: [{ id: 'user-1', channelId: 'ch-1' }],
                total: 1,
            });

            const { users } = await dataSource.fetchUsers({ channelId: 'ch-1' } as any, context);

            expect(users.list[0]).toMatchObject({ id: 'user-1', cid: 'cloud-a' });
            expect(users.list[0].channelIds).toContain('ch-1');
            expect(users.meta.source).toBe('remote');
        });

        it('fetchUsers: pulls $join off a member as a join and does not put it on the user record', async () => {
            // A user record is channel-global, so laying a per-channel read cursor onto it makes the
            // last-mapped channel own that field. The cursor's home is the join cache, keyed by
            // `channelId@userId`.
            (mockGateways.user.listUser as jest.Mock).mockResolvedValue({
                list: [{ id: 'user-1', $join: { channelId: 'ch-1', userId: 'user-1', chatNo: 5 } }, { id: 'user-2' }],
                total: 2,
            });

            const { users, joins } = await dataSource.fetchUsers({ channelId: 'ch-1' } as any, context);

            expect(joins).toEqual([expect.objectContaining({ id: 'ch-1@user-1', userId: 'user-1', chatNo: 5 })]);
            expect(users.list.every(u => !('$join' in u))).toBe(true);
            // `$join.channelId` is still used to derive channelIds.
            expect(users.list[0].channelIds).toContain('ch-1');
        });

        it('getMyProfile: maps $user in the UserProfile$ wrapper to a domain user and $site to a domain place', async () => {
            (mockGateways.user.profile as jest.Mock).mockResolvedValue({
                uid: 'me',
                $user: { id: 'me', name: 'Me' },
                $site: { id: 'site-1', name: 'My Site' },
            });

            const { user, site } = await dataSource.getMyProfile(context);

            expect(user).toMatchObject({ id: 'me', cid: 'cloud-a' });
            expect(site).toMatchObject({ id: 'site-1', cid: 'cloud-a' });
        });

        it('getMyProfile: site is null when $site is absent', async () => {
            (mockGateways.user.profile as jest.Mock).mockResolvedValue({ $user: { id: 'me' } });

            const { user, site } = await dataSource.getMyProfile(context);

            expect(user).toMatchObject({ id: 'me', cid: 'cloud-a' });
            expect(site).toBeNull();
        });

        it('getMyProfile: maps safely when the response arrives as a flat user view (or empty)', async () => {
            (mockGateways.user.profile as jest.Mock).mockResolvedValue({ id: 'me', name: 'Me' });
            const flat = await dataSource.getMyProfile(context);
            expect(flat.user).toMatchObject({ id: 'me', cid: 'cloud-a' });
            expect(flat.site).toBeNull();

            (mockGateways.user.profile as jest.Mock).mockResolvedValue(undefined);
            const empty = await dataSource.getMyProfile(context);
            expect(empty.user).toMatchObject({ cid: 'cloud-a' });
            expect(empty.site).toBeNull();
        });

        it('maps the updateProfile response to a single domain user', async () => {
            (mockGateways.user.update as jest.Mock).mockResolvedValue({ id: 'user-1', name: 'New Name' });

            const domain = await dataSource.updateProfile({ name: 'New Name' }, context);

            expect(domain).toMatchObject({ id: 'user-1', cid: 'cloud-a' });
        });

        it('splits user and embedded $join out of the syncChannelUsers response, maps both, and returns the cursor', async () => {
            (mockGateways.user.syncUsers as jest.Mock).mockResolvedValue({
                list: [
                    { id: 'u1', name: 'Alice', $join: { id: 'ch-1@u1', channelId: 'ch-1', userId: 'u1', chatNo: 9 } },
                    { id: 'u2', name: 'Bob' }, // no join → excluded from joins
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

        it('fills a $join missing channelId/userId from the requested channelId and the parent user id', async () => {
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

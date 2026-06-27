import { UserRepositoryV2 } from './UserRepositoryV2';

describe('UserRepositoryV2', () => {
    const createRepository = () => {
        // User repository mixes cache writes and helper passthroughs, so keep each collaborator fully isolated.
        const userRemoteDataSource = {
            fetchUsers: jest.fn(),
            updateProfile: jest.fn(),
            requestInvite: jest.fn(),
            inviteBatch: jest.fn(),
            syncChannelUsers: jest.fn(),
        };
        const userLocalDataSource = {
            observeList: jest.fn(() => () => undefined),
            observeItem: jest.fn(() => () => undefined),
            cacheRead: jest.fn(),
            cacheReadList: jest.fn(),
            cacheWrite: jest.fn(),
            cacheWriteMany: jest.fn(),
            cacheDelete: jest.fn(),
            cacheClear: jest.fn(),
        };
        const joinLocalDataSource = {
            observeList: jest.fn(() => () => undefined),
            observeItem: jest.fn(() => () => undefined),
            cacheRead: jest.fn(),
            cacheReadList: jest.fn(),
            cacheWrite: jest.fn(),
            cacheWriteMany: jest.fn(),
            cacheDelete: jest.fn(),
            cacheClear: jest.fn(),
        };
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
            setContext: () => undefined,
        };

        return {
            repository: new UserRepositoryV2(
                userRemoteDataSource as any,
                userLocalDataSource as any,
                joinLocalDataSource as any,
                contextProvider
            ),
            userRemoteDataSource,
            userLocalDataSource,
            joinLocalDataSource,
        };
    };

    it('writes synced channel users + their embedded joins and returns the next since cursor', async () => {
        const { repository, userRemoteDataSource, userLocalDataSource, joinLocalDataSource } = createRepository();
        userRemoteDataSource.syncChannelUsers.mockResolvedValue({
            users: [{ id: 'u1', cid: 'cloud-a', name: 'Alice' }],
            joins: [{ id: 'ch-1@u1', cid: 'cloud-a', channelId: 'ch-1', userId: 'u1', readNo: 7 }],
            ids: ['u1'],
            syncedAt: 1700,
        });

        const syncedAt = await repository.syncChannelUsers({ channelId: 'ch-1' } as any);

        // Users and joins from the same response are both persisted under the active scope.
        expect(userLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [expect.objectContaining({ id: 'u1', cid: 'cloud-a' })],
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        expect(joinLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [expect.objectContaining({ id: 'ch-1@u1', channelId: 'ch-1', userId: 'u1', readNo: 7 })],
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        // The returned cursor is what the caller passes back as `since`.
        expect(syncedAt).toBe(1700);
    });

    it('skips the join cache write when no members carry an embedded join', async () => {
        const { repository, userRemoteDataSource, joinLocalDataSource } = createRepository();
        userRemoteDataSource.syncChannelUsers.mockResolvedValue({
            users: [{ id: 'u1', cid: 'cloud-a' }],
            joins: [],
            ids: ['u1'],
            syncedAt: 1700,
        });

        await repository.syncChannelUsers({ channelId: 'ch-1' } as any);

        expect(joinLocalDataSource.cacheWriteMany).not.toHaveBeenCalled();
    });

    it('hydrates the join cache from each user’s embedded $join on refreshList', async () => {
        const { repository, userRemoteDataSource, userLocalDataSource, joinLocalDataSource } = createRepository();
        userRemoteDataSource.fetchUsers.mockResolvedValue({
            list: [
                { id: 'u1', cid: 'cloud-a', $join: { id: 'ch-1@u1', channelId: 'ch-1', userId: 'u1', chatNo: 5 } },
                { id: 'u2', cid: 'cloud-a' }, // $join 없음 → join 캐시 대상 아님
            ],
            meta: { total: 2, source: 'remote' },
        });

        await repository.refreshList({ channelId: 'ch-1' } as any);

        // user는 전부 쓰고, $join이 있는 멤버의 join만 캐시에 hydrate한다.
        expect(userLocalDataSource.cacheWriteMany).toHaveBeenCalled();
        expect(joinLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [expect.objectContaining({ id: 'ch-1@u1', channelId: 'ch-1', userId: 'u1' })],
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });

    it('rolls back an optimistic profile patch when updateProfile fails', async () => {
        const { repository, userRemoteDataSource, userLocalDataSource } = createRepository();
        userLocalDataSource.cacheRead.mockResolvedValue({ id: 'u1', name: 'Before' });
        userRemoteDataSource.updateProfile.mockRejectedValue(new Error('boom'));

        await expect(repository.updateProfile({ userId: 'u1', name: 'After' } as any)).rejects.toThrow('boom');

        // The rollback should restore the original cached user after the failed mutation.
        expect(userLocalDataSource.cacheWrite).toHaveBeenLastCalledWith(
            expect.objectContaining({ id: 'u1', name: 'Before' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });

    it('passes invite helper calls straight to the remote datasource', async () => {
        const { repository, userRemoteDataSource } = createRepository();
        userRemoteDataSource.requestInvite.mockResolvedValue({ code: 'invite-1' });
        userRemoteDataSource.inviteBatch.mockResolvedValue({ list: [{ code: 'invite-2' }] });

        // Invite helpers should remain passthroughs so callers see the backend contract directly.
        await expect(repository.requestInvite({ alias: 'a' } as any)).resolves.toEqual({ code: 'invite-1' });
        await expect(repository.requestInviteBatch({ alias: 'a' } as any)).resolves.toEqual([{ code: 'invite-2' }]);
    });
});

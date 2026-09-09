import { UserRepositoryV2, type UserRepositoryV2Options } from './UserRepositoryV2';
import type { DataContext } from './types';

describe('UserRepositoryV2', () => {
    const createRepository = (
        options?: UserRepositoryV2Options,
        context: DataContext = { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
    ) => {
        // User repository mixes cache writes and helper passthroughs, so keep each collaborator fully isolated.
        const userSocketDataSource = {
            fetchUsers: jest.fn(),
            getMyProfile: jest.fn(),
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
        const placeLocalDataSource = {
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
            getContext: () => context,
            setContext: () => undefined,
        };

        return {
            repository: new UserRepositoryV2(
                userSocketDataSource as any,
                userLocalDataSource as any,
                joinLocalDataSource as any,
                placeLocalDataSource as any,
                contextProvider,
                options
            ),
            userSocketDataSource,
            userLocalDataSource,
            joinLocalDataSource,
            placeLocalDataSource,
        };
    };

    it('writes synced channel users + their embedded joins and returns the next since cursor', async () => {
        const { repository, userSocketDataSource, userLocalDataSource, joinLocalDataSource } = createRepository();
        userSocketDataSource.syncChannelUsers.mockResolvedValue({
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
        const { repository, userSocketDataSource, joinLocalDataSource } = createRepository();
        userSocketDataSource.syncChannelUsers.mockResolvedValue({
            users: [{ id: 'u1', cid: 'cloud-a' }],
            joins: [],
            ids: ['u1'],
            syncedAt: 1700,
        });

        await repository.syncChannelUsers({ channelId: 'ch-1' } as any);

        expect(joinLocalDataSource.cacheWriteMany).not.toHaveBeenCalled();
    });

    it('hydrates both the user cache and the join cache on refreshList', async () => {
        const { repository, userSocketDataSource, userLocalDataSource, joinLocalDataSource } = createRepository();
        // The read cursor rides in on the roster response but never on the user record — the
        // data source hands it over separately (see ChannelUsersFetchResult).
        userSocketDataSource.fetchUsers.mockResolvedValue({
            users: {
                list: [
                    { id: 'u1', cid: 'cloud-a' },
                    { id: 'u2', cid: 'cloud-a' },
                ],
                meta: { total: 2, source: 'remote' },
            },
            joins: [{ id: 'ch-1@u1', channelId: 'ch-1', userId: 'u1', chatNo: 5 }],
        });

        await repository.refreshList({ channelId: 'ch-1' } as any);

        expect(userLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [
                { id: 'u1', cid: 'cloud-a' },
                { id: 'u2', cid: 'cloud-a' },
            ],
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        expect(joinLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [expect.objectContaining({ id: 'ch-1@u1', channelId: 'ch-1', userId: 'u1' })],
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });

    it('hydrates the user cache and caches the embedded $site into the place store', async () => {
        const { repository, userSocketDataSource, userLocalDataSource, placeLocalDataSource } = createRepository();
        userSocketDataSource.getMyProfile.mockResolvedValue({
            user: { id: 'me', cid: 'cloud-a', name: 'Me' },
            site: { id: 'site-1', cid: 'cloud-a', name: 'My Site' },
        });

        const profile = await repository.getMyProfile();

        // The mapped user is returned and written so observeItem subscribers see it.
        expect(profile).toMatchObject({ id: 'me', cid: 'cloud-a' });
        expect(userLocalDataSource.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'me', cid: 'cloud-a' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        // The embedded $site is persisted to the place cache under the active scope.
        expect(placeLocalDataSource.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'site-1', cid: 'cloud-a' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });

    it('skips the place cache write when the profile carries no $site', async () => {
        const { repository, userSocketDataSource, placeLocalDataSource } = createRepository();
        userSocketDataSource.getMyProfile.mockResolvedValue({ user: { id: 'me', cid: 'cloud-a' }, site: null });

        await repository.getMyProfile();

        expect(placeLocalDataSource.cacheWrite).not.toHaveBeenCalled();
    });

    it('skips the embedded $site write when the injected predicate vetoes the context', async () => {
        const relayOnly: UserRepositoryV2Options = {
            persistEmbeddedSite: context => (context.cid ?? 'default') === 'default',
        };
        const { repository, userSocketDataSource, userLocalDataSource, placeLocalDataSource } =
            createRepository(relayOnly);
        userSocketDataSource.getMyProfile.mockResolvedValue({
            user: { id: 'me', cid: 'cloud-a' },
            site: { id: 'site-default', cid: 'cloud-a' },
        });

        await repository.getMyProfile();

        // The cloud context is vetoed, so the default place never lands in the cloud partition —
        // while the user write itself stays untouched (ADR-0045).
        expect(userLocalDataSource.cacheWrite).toHaveBeenCalled();
        expect(placeLocalDataSource.cacheWrite).not.toHaveBeenCalled();
    });

    it('persists the embedded $site when the injected predicate approves the context', async () => {
        const relayOnly: UserRepositoryV2Options = {
            persistEmbeddedSite: context => (context.cid ?? 'default') === 'default',
        };
        const { repository, userSocketDataSource, placeLocalDataSource } = createRepository(relayOnly, {
            cid: 'default',
            sid: 'site-1',
            uid: 'me',
        });
        userSocketDataSource.getMyProfile.mockResolvedValue({
            user: { id: 'me', cid: 'default' },
            site: { id: 'site-default', cid: 'default' },
        });

        await repository.getMyProfile();

        expect(placeLocalDataSource.cacheWrite).toHaveBeenCalledWith(expect.objectContaining({ id: 'site-default' }), {
            cid: 'default',
            sid: 'site-1',
            uid: 'me',
        });
    });

    it('rolls back an optimistic profile patch when updateProfile fails', async () => {
        const { repository, userSocketDataSource, userLocalDataSource } = createRepository();
        userLocalDataSource.cacheRead.mockResolvedValue({ id: 'u1', name: 'Before' });
        userSocketDataSource.updateProfile.mockRejectedValue(new Error('boom'));

        await expect(repository.updateProfile({ userId: 'u1', name: 'After' } as any)).rejects.toThrow('boom');

        // The rollback should restore the original cached user after the failed mutation.
        expect(userLocalDataSource.cacheWrite).toHaveBeenLastCalledWith(
            expect.objectContaining({ id: 'u1', name: 'Before' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });

    it('passes invite helper calls straight to the remote datasource', async () => {
        const { repository, userSocketDataSource } = createRepository();
        userSocketDataSource.requestInvite.mockResolvedValue({ code: 'invite-1' });
        userSocketDataSource.inviteBatch.mockResolvedValue({ list: [{ code: 'invite-2' }] });

        // Invite helpers should remain passthroughs so callers see the backend contract directly.
        await expect(repository.requestInvite({ alias: 'a' } as any)).resolves.toEqual({ code: 'invite-1' });
        await expect(
            repository.requestInviteBatch({ to: ['+821011112222'], channelId: 'ch-1' } as any)
        ).resolves.toEqual([{ code: 'invite-2' }]);
    });

    it('forwards the batch payload untouched — the recipient list stays a list, channelId survives', async () => {
        const { repository, userSocketDataSource } = createRepository();
        userSocketDataSource.inviteBatch.mockResolvedValue({ list: [] });

        await repository.requestInviteBatch({
            to: ['+821011112222', '+821033334444'],
            channelId: 'ch-1',
        } as any);

        // Folding the list into one comma-joined string is what made the server read it as a single
        // phone and reject it (`@phone[a,b] is invalid format`); dropping channelId lost the target.
        expect(userSocketDataSource.inviteBatch).toHaveBeenCalledWith({
            to: ['+821011112222', '+821033334444'],
            channelId: 'ch-1',
        });
    });
});

describe('UserRepositoryV2 — HTTP relay-user/profile surface (ADR-0070 2단계 후반)', () => {
    const contextProvider = { getContext: () => ({ cid: 'cloud-a', uid: 'me' }), setContext: () => undefined };
    const emptyLocal = () => ({
        observeList: jest.fn(() => () => undefined),
        observeItem: jest.fn(() => () => undefined),
        cacheRead: jest.fn(),
        cacheReadList: jest.fn(),
        cacheWrite: jest.fn(),
        cacheWriteMany: jest.fn(),
        cacheDelete: jest.fn(),
        cacheClear: jest.fn(),
    });

    it('throws a clear error when IUserHttpDataSource is not injected', async () => {
        const repository = new UserRepositoryV2(
            {} as any,
            emptyLocal() as any,
            emptyLocal() as any,
            emptyLocal() as any,
            contextProvider as any
        );

        await expect(repository.tryFetchProfile()).rejects.toThrow('not injected');
    });

    it('delegates to the injected http data source', async () => {
        const http = { listRelayUsers: jest.fn(), tryFetchProfile: jest.fn(), updateProfileHttp: jest.fn() };
        http.tryFetchProfile.mockResolvedValue({ id: 'u1' });
        const repository = new UserRepositoryV2(
            {} as any,
            emptyLocal() as any,
            emptyLocal() as any,
            emptyLocal() as any,
            contextProvider as any,
            undefined,
            http as any
        );

        await expect(repository.tryFetchProfile()).resolves.toEqual({ id: 'u1' });
    });
});

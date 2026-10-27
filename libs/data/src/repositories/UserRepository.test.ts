import { UserRepository, type UserRepositoryOptions } from './UserRepository';
import type { DataContext } from './types';

describe('UserRepository', () => {
    const createRepository = (
        options?: UserRepositoryOptions,
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
            listDevices: jest.fn(),
            unlinkDevice: jest.fn(),
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
            repository: new UserRepository(
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
        const relayOnly: UserRepositoryOptions = {
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
        // while the user write itself stays untouched (ADR-0094).
        expect(userLocalDataSource.cacheWrite).toHaveBeenCalled();
        expect(placeLocalDataSource.cacheWrite).not.toHaveBeenCalled();
    });

    it('persists the embedded $site when the injected predicate approves the context', async () => {
        const relayOnly: UserRepositoryOptions = {
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

    describe('my devices', () => {
        it('listDevices returns the socket answer and writes nothing to the cache', async () => {
            const { repository, userSocketDataSource, userLocalDataSource } = createRepository();
            const view = { list: [{ id: 'dev-1', kind: 'web', presence: 'green', current: true }], at: 1700 };
            userSocketDataSource.listDevices.mockResolvedValue(view);

            await expect(repository.listDevices()).resolves.toBe(view);
            expect(userLocalDataSource.cacheWrite).not.toHaveBeenCalled();
            expect(userLocalDataSource.cacheWriteMany).not.toHaveBeenCalled();
        });

        it('unlinkDevice passes the device id through and returns the socket answer', async () => {
            const { repository, userSocketDataSource } = createRepository();
            const view = { id: 'dev-2', marked: true, closed: true };
            userSocketDataSource.unlinkDevice.mockResolvedValue(view);

            await expect(repository.unlinkDevice('dev-2')).resolves.toBe(view);
            expect(userSocketDataSource.unlinkDevice).toHaveBeenCalledWith('dev-2');
        });
    });
});

describe('UserRepository — HTTP relay-user/profile surface (ADR-0070 late stage 2)', () => {
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
        const repository = new UserRepository(
            {} as any,
            emptyLocal() as any,
            emptyLocal() as any,
            emptyLocal() as any,
            contextProvider as any
        );

        await expect(repository.tryFetchProfile()).rejects.toThrow('not injected');
    });

    it('delegates to the injected http data source', async () => {
        const http = { listRelayUsers: jest.fn(), tryFetchProfile: jest.fn() };
        http.tryFetchProfile.mockResolvedValue({ id: 'u1' });
        const repository = new UserRepository(
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

describe('UserRepository.listPlaceMembers', () => {
    const member = (id: string) => ({ id, cid: 'cloud-a', name: `name-${id}` });
    const ids = (from: number, count: number) => Array.from({ length: count }, (_, i) => `u${from + i}`);
    const page = (memberIds: string[], total: number, pageNo = 0, limit = 10) => ({
        members: memberIds.map(member),
        total,
        page: pageNo,
        limit,
    });

    const createRepository = (context: DataContext = { cid: 'cloud-a', uid: 'me' }) => {
        const holder = { context };
        const userSocketDataSource = { fetchPlaceUsers: jest.fn() };
        // Both profile entry points are present so a test can prove the delta sync is never the one used.
        const profileRepository = {
            syncProfilesOf: jest.fn().mockResolvedValue({ updatedCount: 0, removedCount: 0 }),
            syncProfiles: jest.fn(),
        };
        const contextProvider = {
            getContext: () => holder.context,
            setContext: (next: DataContext) => {
                holder.context = next;
            },
        };
        const repository = new UserRepository(
            userSocketDataSource as any,
            {} as any,
            {} as any,
            {} as any,
            contextProvider,
            undefined,
            undefined,
            profileRepository
        );
        return { repository, userSocketDataSource, profileRepository, contextProvider };
    };

    it('reads every page until total, and a short page is not taken as the end', async () => {
        const { repository, userSocketDataSource } = createRepository();
        // The server drops members who left after slicing, so pages come back short of the limit.
        userSocketDataSource.fetchPlaceUsers
            .mockResolvedValueOnce(page(ids(0, 8), 25, 0))
            .mockResolvedValueOnce(page(ids(8, 10), 25, 1))
            .mockResolvedValueOnce(page(ids(18, 3), 25, 2));

        const result = await repository.listPlaceMembers({ placeId: 'site-1', sessionPlaceId: 'site-1' });

        expect(userSocketDataSource.fetchPlaceUsers.mock.calls.map(call => call[0])).toEqual([
            { id: 'site-1', page: 0, limit: 10 },
            { id: 'site-1', page: 1, limit: 10 },
            { id: 'site-1', page: 2, limit: 10 },
        ]);
        expect(result.members.map(m => m.id)).toEqual(ids(0, 21));
    });

    it('stops at an empty page even when total still promises more', async () => {
        const { repository, userSocketDataSource } = createRepository();
        // `total` is counted before departed members are dropped, so it can overstate the list.
        userSocketDataSource.fetchPlaceUsers
            .mockResolvedValueOnce(page(ids(0, 10), 40, 0))
            .mockResolvedValueOnce(page([], 40, 1));

        const result = await repository.listPlaceMembers({ placeId: 'site-1', sessionPlaceId: 'site-1' });

        expect(userSocketDataSource.fetchPlaceUsers).toHaveBeenCalledTimes(2);
        expect(result.members).toHaveLength(10);
    });

    it('stops when a page brings nobody new, instead of looping on a server that ignores page', async () => {
        const { repository, userSocketDataSource } = createRepository();
        userSocketDataSource.fetchPlaceUsers.mockResolvedValue(page(ids(0, 10), 50, 0));

        const result = await repository.listPlaceMembers({ placeId: 'site-1', sessionPlaceId: 'site-1' });

        expect(userSocketDataSource.fetchPlaceUsers).toHaveBeenCalledTimes(2);
        expect(result.members).toHaveLength(10);
    });

    it("loads each page's profiles with that page's ids on the listed place, never the delta sync", async () => {
        const { repository, userSocketDataSource, profileRepository } = createRepository();
        userSocketDataSource.fetchPlaceUsers
            .mockResolvedValueOnce(page(ids(0, 10), 13, 0))
            .mockResolvedValueOnce(page(ids(10, 3), 13, 1));

        const result = await repository.listPlaceMembers({ placeId: 'site-1', sessionPlaceId: 'site-1' });

        expect(profileRepository.syncProfilesOf.mock.calls).toEqual([
            [ids(0, 10), 'site-1'],
            [ids(10, 3), 'site-1'],
        ]);
        // The by-id load must not touch the background cursor; the delta sync is the only thing that does.
        expect(profileRepository.syncProfiles).not.toHaveBeenCalled();
        expect(result.profiles).toBe('loaded');
    });

    it('never names more user ids in one profile load than one page holds', async () => {
        const { repository, userSocketDataSource, profileRepository } = createRepository();
        userSocketDataSource.fetchPlaceUsers
            .mockResolvedValueOnce(page(ids(0, 4), 9, 0, 4))
            .mockResolvedValueOnce(page(ids(4, 4), 9, 1, 4))
            .mockResolvedValueOnce(page(ids(8, 1), 9, 2, 4));

        await repository.listPlaceMembers({ placeId: 'site-1', sessionPlaceId: 'site-1', pageSize: 4 });

        expect(userSocketDataSource.fetchPlaceUsers.mock.calls[0][0]).toEqual({ id: 'site-1', page: 0, limit: 4 });
        for (const [userIds] of profileRepository.syncProfilesOf.mock.calls) {
            expect(userIds.length).toBeLessThanOrEqual(4);
        }
    });

    it.each([
        ['another place', 'site-2'],
        ['no place it can vouch for (a switch in flight)', null],
    ])('skips the profile load when the session is on %s', async (_label, sessionPlaceId) => {
        const { repository, userSocketDataSource, profileRepository } = createRepository();
        userSocketDataSource.fetchPlaceUsers.mockResolvedValueOnce(page(ids(0, 2), 2));

        const result = await repository.listPlaceMembers({ placeId: 'site-1', sessionPlaceId });

        // profile.sync answers for the SESSION's place and its rows are stamped with the place named
        // here — calling it now would file another place's profiles under site-1.
        expect(profileRepository.syncProfilesOf).not.toHaveBeenCalled();
        expect(result.members.map(m => m.id)).toEqual(['u0', 'u1']);
        expect(result.profiles).toBe('skipped');
    });

    it('still returns every member when a profile load fails, and keeps paging', async () => {
        const { repository, userSocketDataSource, profileRepository } = createRepository();
        userSocketDataSource.fetchPlaceUsers
            .mockResolvedValueOnce(page(ids(0, 10), 12, 0))
            .mockResolvedValueOnce(page(ids(10, 2), 12, 1));
        profileRepository.syncProfilesOf.mockRejectedValueOnce(new Error('413 payload too large'));

        const result = await repository.listPlaceMembers({ placeId: 'site-1', sessionPlaceId: 'site-1' });

        expect(result.members).toHaveLength(12);
        expect(profileRepository.syncProfilesOf).toHaveBeenCalledTimes(2);
        expect(result.profiles).toBe('failed');
    });

    it('binds the answer to the cloud and place it was asked for, even if the context moves meanwhile', async () => {
        const { repository, userSocketDataSource, contextProvider } = createRepository();
        userSocketDataSource.fetchPlaceUsers.mockImplementationOnce(async () => {
            contextProvider.setContext({ cid: 'cloud-b', uid: 'me' });
            return page(ids(0, 1), 1);
        });

        const result = await repository.listPlaceMembers({ placeId: 'site-1', sessionPlaceId: 'site-1' });

        expect(result.context).toEqual({ cid: 'cloud-a', sid: 'site-1' });
        expect(userSocketDataSource.fetchPlaceUsers.mock.calls[0][1]).toMatchObject({ cid: 'cloud-a' });
    });

    it('stops loading profiles once the cloud moves between pages, and still returns every member', async () => {
        const { repository, userSocketDataSource, profileRepository, contextProvider } = createRepository();
        userSocketDataSource.fetchPlaceUsers
            .mockImplementationOnce(async () => page(ids(0, 10), 15, 0))
            .mockImplementationOnce(async () => {
                // The switch lands while page 1 is in flight: its profiles would be answered by the
                // new session and filed under the new cloud.
                contextProvider.setContext({ cid: 'cloud-b', uid: 'me' });
                return page(ids(10, 5), 15, 1);
            });

        const result = await repository.listPlaceMembers({ placeId: 'site-1', sessionPlaceId: 'site-1' });

        expect(profileRepository.syncProfilesOf.mock.calls).toEqual([[ids(0, 10), 'site-1']]);
        expect(result.members).toHaveLength(15);
        expect(result.profiles).toBe('failed');
    });

    it('asks for the next page without waiting for the previous page profiles', async () => {
        const { repository, userSocketDataSource, profileRepository } = createRepository();
        let releaseProfiles: () => void = () => undefined;
        profileRepository.syncProfilesOf.mockImplementationOnce(
            () => new Promise(resolve => (releaseProfiles = () => resolve({ updatedCount: 0, removedCount: 0 })))
        );
        userSocketDataSource.fetchPlaceUsers
            .mockResolvedValueOnce(page(ids(0, 10), 12, 0))
            .mockResolvedValueOnce(page(ids(10, 2), 12, 1));

        const pending = repository.listPlaceMembers({ placeId: 'site-1', sessionPlaceId: 'site-1' });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(userSocketDataSource.fetchPlaceUsers).toHaveBeenCalledTimes(2);
        releaseProfiles();
        await expect(pending).resolves.toMatchObject({ profiles: 'loaded' });
    });

    it('refuses while the socket is still on another cloud', async () => {
        const { repository, userSocketDataSource } = createRepository({ cid: 'cloud-b', socketCid: 'cloud-a' });

        await expect(repository.listPlaceMembers({ placeId: 'site-1', sessionPlaceId: 'site-1' })).rejects.toThrow(
            'another cloud'
        );
        expect(userSocketDataSource.fetchPlaceUsers).not.toHaveBeenCalled();
    });

    it('passes a list failure (403 for a non-member) through to the caller', async () => {
        const { repository, userSocketDataSource } = createRepository();
        userSocketDataSource.fetchPlaceUsers.mockRejectedValueOnce(
            new Error('403 FORBIDDEN - not a member of site[site-1]')
        );

        await expect(repository.listPlaceMembers({ placeId: 'site-1', sessionPlaceId: 'site-1' })).rejects.toThrow(
            '403'
        );
    });
});

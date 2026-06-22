import { ProfileRepositoryV2 } from './ProfileRepositoryV2';

describe('ProfileRepositoryV2', () => {
    const createRepository = () => {
        // Mock only the collaborators the repository should orchestrate.
        const profileRemoteDataSource = {
            getSiteProfile: jest.fn(),
            setSiteProfile: jest.fn(),
        };
        const userRemoteDataSource = {
            syncSiteProfile: jest.fn(),
        };
        const profileLocalDataSource = {
            observeList: jest.fn(() => () => undefined),
            observeItem: jest.fn(() => () => undefined),
            cacheRead: jest.fn(),
            cacheReadList: jest.fn(),
            cacheWrite: jest.fn(),
            cacheWriteMany: jest.fn(),
            cacheDelete: jest.fn(),
            cacheDeleteMany: jest.fn(),
            cacheClear: jest.fn(),
        };
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
            setContext: () => undefined,
        };
        const domainEventBus = {
            on: jest.fn(() => () => undefined),
            emit: jest.fn(),
            onAny: jest.fn(() => () => undefined),
        };

        const repository = new ProfileRepositoryV2(
            profileRemoteDataSource as any,
            userRemoteDataSource as any,
            profileLocalDataSource as any,
            contextProvider,
            domainEventBus as any
        );

        return {
            repository,
            profileRemoteDataSource,
            userRemoteDataSource,
            profileLocalDataSource,
        };
    };

    it('writes non-null sync deltas and deletes null resets for the current site', async () => {
        const { repository, userRemoteDataSource, profileLocalDataSource } = createRepository();
        userRemoteDataSource.syncSiteProfile.mockResolvedValue({
            profiles: {
                'user-1': { nick: 'Alice', thumbnail: 'thumb-1' },
                'user-2': null,
            },
            syncedAt: 123,
        });

        const result = await repository.syncProfiles(0);

        // Non-null deltas should be normalized into cache writes for the active site scope.
        expect(profileLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [
                expect.objectContaining({
                    id: 'site-1:user-1',
                    sid: 'site-1',
                    uid: 'user-1',
                    nick: 'Alice',
                }),
            ],
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        // Null deltas represent resets, so they should be translated into cache deletions.
        expect(profileLocalDataSource.cacheDeleteMany).toHaveBeenCalledWith(['site-1:user-2'], {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
        expect(result).toEqual({ syncedAt: 123, updatedCount: 1, removedCount: 1 });
    });

    it('rolls back the optimistic cache write when setSiteProfile fails', async () => {
        const { repository, profileRemoteDataSource, profileLocalDataSource } = createRepository();
        profileLocalDataSource.cacheRead.mockResolvedValue({
            id: 'site-1:me',
            sid: 'site-1',
            uid: 'me',
            userId: 'me',
            nick: 'Before',
        });
        profileRemoteDataSource.setSiteProfile.mockRejectedValue(new Error('boom'));

        // The repository should optimistically patch local state first, then restore the previous snapshot on failure.
        await expect(
            repository.setSiteProfile({
                siteId: 'site-1',
                nick: 'After',
                active: true,
            } as any)
        ).rejects.toThrow('boom');

        // The rollback should restore the previous local snapshot after the remote failure.
        expect(profileLocalDataSource.cacheWrite).toHaveBeenLastCalledWith(
            expect.objectContaining({ nick: 'Before' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });

    it('throws when refreshItem cannot resolve a sid from input or context', async () => {
        const { profileRemoteDataSource, userRemoteDataSource, profileLocalDataSource } = createRepository();
        const repository = new ProfileRepositoryV2(
            profileRemoteDataSource as any,
            userRemoteDataSource as any,
            profileLocalDataSource as any,
            {
                getContext: () => ({ cid: 'cloud-a', uid: 'me' }),
                setContext: () => undefined,
            },
            {
                on: jest.fn(() => () => undefined),
                emit: jest.fn(),
                onAny: jest.fn(() => () => undefined),
            } as any
        );

        await expect(repository.refreshItem()).rejects.toThrow('[RepositoryV2] sid is required.');
    });

    it('writes the fetched profile into local cache during refreshItem', async () => {
        const { repository, profileRemoteDataSource, profileLocalDataSource } = createRepository();
        profileRemoteDataSource.getSiteProfile.mockResolvedValue({
            id: 'site-1:me',
            siteId: 'site-1',
            userId: 'me',
            nick: 'Alice',
        });

        const result = await repository.refreshItem({ siteId: 'site-1', userId: 'me' } as any);

        // refreshItem should normalize the remote payload and immediately hydrate local cache.
        expect(profileLocalDataSource.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'site-1:me', sid: 'site-1', uid: 'me' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        expect(result).toEqual(expect.objectContaining({ id: 'site-1:me' }));
    });

    it('delegates cache helper methods to the local profile datasource', async () => {
        const { repository, profileLocalDataSource } = createRepository();

        await repository.cacheRead('site-1:me');
        await repository.cacheReadList({ siteId: 'site-1' });
        await repository.cacheWrite({ id: 'site-1:me' } as any);
        await repository.cacheDelete('site-1:me');
        await repository.cacheClear();

        // Cache helpers should remain thin wrappers around the profile local datasource.
        expect(profileLocalDataSource.cacheClear).toHaveBeenCalledWith({
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
    });

    it('uses the scoped sid when setMyProfile delegates to setSiteProfile', async () => {
        const { repository, profileRemoteDataSource, profileLocalDataSource } = createRepository();
        profileRemoteDataSource.setSiteProfile.mockResolvedValue({
            id: 'site-1:me',
            siteId: 'site-1',
            userId: 'me',
            nick: 'After',
        });

        const result = await repository.setMyProfile({ nick: 'After' } as any);

        expect(profileRemoteDataSource.setSiteProfile).toHaveBeenCalledWith(
            expect.objectContaining({ siteId: 'site-1' })
        );
        expect(profileLocalDataSource.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ sid: 'site-1', uid: 'me' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        expect(result).toEqual(expect.objectContaining({ id: 'site-1:me' }));
    });

    it('throws when setSiteProfile cannot resolve a uid from payload or context', async () => {
        const { profileRemoteDataSource, userRemoteDataSource, profileLocalDataSource } = createRepository();
        const repository = new ProfileRepositoryV2(
            profileRemoteDataSource as any,
            userRemoteDataSource as any,
            profileLocalDataSource as any,
            {
                getContext: () => ({ cid: 'cloud-a', sid: 'site-1' }),
                setContext: () => undefined,
            },
            {
                on: jest.fn(() => () => undefined),
                emit: jest.fn(),
                onAny: jest.fn(() => () => undefined),
            } as any
        );

        await expect(repository.setSiteProfile({ siteId: 'site-1', nick: 'After' } as any)).rejects.toThrow(
            '[RepositoryV2] uid is required.'
        );
    });
});

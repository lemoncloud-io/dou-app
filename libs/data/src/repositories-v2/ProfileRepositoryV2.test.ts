import { ProfileRepositoryV2 } from './ProfileRepositoryV2';

describe('ProfileRepositoryV2', () => {
    const createRepository = (context: Record<string, unknown> = { cid: 'cloud-a', sid: 'site-1', uid: 'me' }) => {
        // Profile owns its dedicated gateway: get / getMine / set / sync.
        const profileSocketDataSource = {
            get: jest.fn(),
            getMine: jest.fn(),
            set: jest.fn(),
            sync: jest.fn(),
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
            getContext: () => context,
            setContext: () => undefined,
        };
        const repository = new ProfileRepositoryV2(
            profileSocketDataSource as any,
            profileLocalDataSource as any,
            contextProvider as any
        );

        return { repository, profileSocketDataSource, profileLocalDataSource };
    };

    it('writes non-null sync deltas and deletes null resets for the current site', async () => {
        const { repository, profileSocketDataSource, profileLocalDataSource } = createRepository();
        // The remote source now returns the mapped delta (domain upserts + ids to remove).
        profileSocketDataSource.sync.mockResolvedValue({
            upserts: [{ id: 'site-1@user-1', sid: 'site-1', uid: 'user-1', userId: 'user-1', nick: 'Alice' }],
            removals: ['site-1@user-2'],
            syncedAt: 123,
        });

        const result = await repository.syncProfiles(0);

        // profile.sync delta → cache writes for the active site scope.
        expect(profileSocketDataSource.sync).toHaveBeenCalledWith({ since: 0 }, expect.anything());
        expect(profileLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [
                expect.objectContaining({
                    id: 'site-1@user-1',
                    sid: 'site-1',
                    uid: 'user-1',
                    nick: 'Alice',
                }),
            ],
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        // Null deltas represent resets, so they should be translated into cache deletions.
        expect(profileLocalDataSource.cacheDeleteMany).toHaveBeenCalledWith(['site-1@user-2'], {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
        expect(result).toEqual({ syncedAt: 123, updatedCount: 1, removedCount: 1 });
    });

    it('rolls back the optimistic cache write when setProfile fails', async () => {
        const { repository, profileSocketDataSource, profileLocalDataSource } = createRepository();
        profileLocalDataSource.cacheRead.mockResolvedValue({
            id: 'site-1@me',
            sid: 'site-1',
            uid: 'me',
            userId: 'me',
            nick: 'Before',
        });
        profileSocketDataSource.set.mockRejectedValue(new Error('boom'));

        await expect(repository.setProfile({ siteId: 'site-1', nick: 'After', active: true } as any)).rejects.toThrow(
            'boom'
        );

        // The rollback should restore the previous local snapshot after the remote failure.
        expect(profileLocalDataSource.cacheWrite).toHaveBeenLastCalledWith(
            expect.objectContaining({ nick: 'Before' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });

    it('throws when refreshItem is given no id', async () => {
        const { repository } = createRepository();
        await expect(repository.refreshItem('')).rejects.toThrow('[RepositoryV2] id is required.');
    });

    it('writes the fetched profile into local cache during refreshItem (profile.get)', async () => {
        const { repository, profileSocketDataSource, profileLocalDataSource } = createRepository();
        profileSocketDataSource.get.mockResolvedValue({
            id: 'site-1@me',
            sid: 'site-1',
            uid: 'me',
            siteId: 'site-1',
            userId: 'me',
            nick: 'Alice',
        });

        const result = await repository.refreshItem('site-1@me');

        expect(profileSocketDataSource.get).toHaveBeenCalledWith({ id: 'site-1@me' }, expect.anything());
        expect(profileLocalDataSource.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'site-1@me', sid: 'site-1', uid: 'me' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        expect(result).toEqual(expect.objectContaining({ id: 'site-1@me' }));
    });

    it('fetches my profile via profile.get-mine and hydrates local cache', async () => {
        const { repository, profileSocketDataSource, profileLocalDataSource } = createRepository();
        profileSocketDataSource.getMine.mockResolvedValue({
            id: 'site-1@me',
            sid: 'site-1',
            uid: 'me',
            siteId: 'site-1',
            userId: 'me',
            nick: 'Me',
        });

        const result = await repository.getMyProfile();

        expect(profileSocketDataSource.getMine).toHaveBeenCalled();
        expect(profileLocalDataSource.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'site-1@me', sid: 'site-1', uid: 'me' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        expect(result).toEqual(expect.objectContaining({ id: 'site-1@me' }));
    });

    it('delegates cache helper methods to the local profile datasource', async () => {
        const { repository, profileLocalDataSource } = createRepository();

        await repository.cacheRead('site-1@me');
        await repository.cacheReadList({ siteId: 'site-1' } as any);
        await repository.cacheWrite({ id: 'site-1@me' } as any);
        await repository.cacheDelete('site-1@me');
        await repository.cacheClear();

        expect(profileLocalDataSource.cacheClear).toHaveBeenCalledWith({
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
    });

    it('uses the scoped sid when setMyProfile delegates to setProfile (profile.set)', async () => {
        const { repository, profileSocketDataSource, profileLocalDataSource } = createRepository();
        profileSocketDataSource.set.mockResolvedValue({
            id: 'site-1@me',
            sid: 'site-1',
            uid: 'me',
            siteId: 'site-1',
            userId: 'me',
            nick: 'After',
        });

        const result = await repository.setMyProfile({ nick: 'After' } as any);

        expect(profileSocketDataSource.set).toHaveBeenCalledWith(
            expect.objectContaining({ siteId: 'site-1' }),
            expect.anything()
        );
        expect(profileLocalDataSource.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ sid: 'site-1', uid: 'me' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        expect(result).toEqual(expect.objectContaining({ id: 'site-1@me' }));
    });

    it('throws when setProfile cannot resolve a uid from payload or context', async () => {
        const { repository } = createRepository({ cid: 'cloud-a', sid: 'site-1' });

        await expect(repository.setProfile({ siteId: 'site-1', nick: 'After' } as any)).rejects.toThrow(
            '[RepositoryV2] uid is required.'
        );
    });
});

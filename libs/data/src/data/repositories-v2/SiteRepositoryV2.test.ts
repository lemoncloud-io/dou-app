import { SiteRepositoryV2 } from './SiteRepositoryV2';

describe('SiteRepositoryV2', () => {
    const createRepository = () => {
        // Mock remote fetch/mutation calls independently from local cache writes to keep sequencing assertions simple.
        const siteRemoteDataSource = {
            fetchSite: jest.fn(),
            createSite: jest.fn(),
            updateSite: jest.fn(),
        };
        const siteLocalDataSource = {
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
        const domainEventBus = {
            on: jest.fn(() => () => undefined),
            emit: jest.fn(),
            onAny: jest.fn(() => () => undefined),
        };

        return {
            repository: new SiteRepositoryV2(
                siteRemoteDataSource as any,
                siteLocalDataSource as any,
                contextProvider,
                domainEventBus as any
            ),
            siteRemoteDataSource,
            siteLocalDataSource,
        };
    };

    it('restores the previous site when updateSite fails after an optimistic cache patch', async () => {
        const { repository, siteRemoteDataSource, siteLocalDataSource } = createRepository();
        siteLocalDataSource.cacheRead.mockResolvedValue({ id: 'site-1', name: 'Before' });
        siteRemoteDataSource.updateSite.mockRejectedValue(new Error('boom'));

        await expect(repository.updateSite({ siteId: 'site-1', name: 'After' } as any)).rejects.toThrow('boom');

        // The final write should be the rollback to the original cached site snapshot.
        expect(siteLocalDataSource.cacheWrite).toHaveBeenLastCalledWith(
            expect.objectContaining({ id: 'site-1', name: 'Before' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });

    it('writes ordered remote sites into local cache during refreshList', async () => {
        const { repository, siteRemoteDataSource, siteLocalDataSource } = createRepository();
        siteRemoteDataSource.fetchSite.mockResolvedValue({
            list: [
                { id: 'site-1', name: 'A' },
                { id: 'site-2', name: 'B' },
            ],
        });

        const result = await repository.refreshList({});

        // refreshList should preserve remote ordering by writing explicit order indexes into local cache.
        expect(siteLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [expect.objectContaining({ id: 'site-1', order: 0 }), expect.objectContaining({ id: 'site-2', order: 1 })],
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        expect(result).toEqual({ wroteCount: 2 });
    });

    it('persists the created site into local cache after a successful remote create', async () => {
        const { repository, siteRemoteDataSource, siteLocalDataSource } = createRepository();
        siteRemoteDataSource.createSite.mockResolvedValue({ id: 'site-3', name: 'Created' });

        const result = await repository.createSite({ name: 'Created' } as any);

        // A successful create should immediately hydrate the local read-model with the canonical server response.
        expect(siteLocalDataSource.cacheWrite).toHaveBeenCalledWith(expect.objectContaining({ id: 'site-3' }), {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
        expect(result).toEqual(expect.objectContaining({ id: 'site-3' }));
    });
});

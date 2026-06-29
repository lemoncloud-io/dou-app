import { PlaceRepositoryV2 } from './PlaceRepositoryV2';
import { createRepositoriesV2 } from './index';

describe('PlaceRepositoryV2', () => {
    const createRepository = () => {
        // Mock remote fetch/mutation calls independently from local cache writes to keep sequencing assertions simple.
        const placeRemoteDataSource = {
            fetchPlace: jest.fn(),
            createPlace: jest.fn(),
            getPlace: jest.fn(),
            updatePlace: jest.fn(),
            deletePlace: jest.fn(),
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
            getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
            setContext: () => undefined,
        };

        return {
            repository: new PlaceRepositoryV2(
                placeRemoteDataSource as any,
                placeLocalDataSource as any,
                contextProvider
            ),
            placeRemoteDataSource,
            placeLocalDataSource,
        };
    };

    it('restores the previous place when updatePlace fails after an optimistic cache patch', async () => {
        const { repository, placeRemoteDataSource, placeLocalDataSource } = createRepository();
        placeLocalDataSource.cacheRead.mockResolvedValue({ id: 'place-1', name: 'Before' });
        placeRemoteDataSource.updatePlace.mockRejectedValue(new Error('boom'));

        await expect(repository.updatePlace({ id: 'place-1', name: 'After' } as any)).rejects.toThrow('boom');

        // The final write should be the rollback to the original cached place snapshot.
        expect(placeLocalDataSource.cacheWrite).toHaveBeenLastCalledWith(
            expect.objectContaining({ id: 'place-1', name: 'Before' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });

    it('writes ordered remote places into local cache during refreshList', async () => {
        const { repository, placeRemoteDataSource, placeLocalDataSource } = createRepository();
        placeRemoteDataSource.fetchPlace.mockResolvedValue({
            list: [
                { id: 'place-1', name: 'A' },
                { id: 'place-2', name: 'B' },
            ],
        });

        const result = await repository.refreshList({});

        // refreshList should preserve remote ordering by writing explicit order indexes into local cache.
        expect(placeLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [
                expect.objectContaining({ id: 'place-1', order: 0 }),
                expect.objectContaining({ id: 'place-2', order: 1 }),
            ],
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        expect(result).toBeUndefined();
    });

    it('persists the created place into local cache after a successful remote create', async () => {
        const { repository, placeRemoteDataSource, placeLocalDataSource } = createRepository();
        placeRemoteDataSource.createPlace.mockResolvedValue({ id: 'place-3', name: 'Created' });

        const result = await repository.createPlace({ name: 'Created' } as any);

        // A successful create should immediately hydrate the local read-model with the canonical server response.
        expect(placeLocalDataSource.cacheWrite).toHaveBeenCalledWith(expect.objectContaining({ id: 'place-3' }), {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
        expect(result).toEqual(expect.objectContaining({ id: 'place-3' }));
    });

    it('writes to the request-time snapshot even if the global context changes before remote resolve', async () => {
        const mutableContext = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };
        let resolveRemote: ((value: unknown) => void) | null = null;
        const placeRemoteDataSource = {
            fetchPlace: jest.fn().mockImplementation(
                () =>
                    new Promise(resolve => {
                        resolveRemote = resolve;
                    })
            ),
            createPlace: jest.fn(),
            getPlace: jest.fn(),
            updatePlace: jest.fn(),
            deletePlace: jest.fn(),
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
        const repository = new PlaceRepositoryV2(placeRemoteDataSource as any, placeLocalDataSource as any, {
            getContext: () => mutableContext,
            setContext: next => Object.assign(mutableContext, next),
        });

        const pending = repository.refreshList({});
        Object.assign(mutableContext, { cid: 'cloud-b', sid: 'site-9', uid: 'other' });
        resolveRemote?.({ list: [{ id: 'place-1', name: 'A' }] });

        await pending;

        expect(placeLocalDataSource.cacheWriteMany).toHaveBeenCalledWith([expect.objectContaining({ id: 'place-1' })], {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
    });

    it('supports a debug context-bound repository facade via withContext', async () => {
        const placeRemoteDataSource = {
            fetchPlace: jest.fn().mockResolvedValue({ list: [] }),
            createPlace: jest.fn(),
            getPlace: jest.fn(),
            updatePlace: jest.fn(),
            deletePlace: jest.fn(),
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
        const emptyRemote = {} as any;
        const emptyLocal = {} as any;
        const repositories = createRepositoriesV2({
            remoteDataSources: {
                ...emptyRemote,
                place: placeRemoteDataSource,
            },
            localDataSources: {
                ...emptyLocal,
                place: placeLocalDataSource,
            },
            context: {
                getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
                setContext: () => undefined,
            },
        } as any);

        const contextual = repositories.withContext({ cid: 'cloud-debug', sid: 'site-debug', uid: 'debugger' });
        await contextual.place.refreshList({});

        expect(placeLocalDataSource.cacheWriteMany).toHaveBeenCalledWith([], {
            cid: 'cloud-debug',
            sid: 'site-debug',
            uid: 'debugger',
        });
    });
});

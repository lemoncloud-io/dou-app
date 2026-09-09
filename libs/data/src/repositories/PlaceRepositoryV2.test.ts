import { PlaceRepositoryV2 } from './PlaceRepositoryV2';
import { createRepositoriesV2 } from './index';

describe('PlaceRepositoryV2', () => {
    const createRepository = () => {
        // Mock remote fetch/mutation calls independently from local cache writes to keep sequencing assertions simple.
        const placeSocketDataSource = {
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
            cacheDeleteMany: jest.fn(),
            cacheClear: jest.fn(),
        };
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
            setContext: () => undefined,
        };

        return {
            repository: new PlaceRepositoryV2(
                placeSocketDataSource as any,
                placeLocalDataSource as any,
                contextProvider
            ),
            placeSocketDataSource,
            placeLocalDataSource,
        };
    };

    it('restores the previous place when updatePlace fails after an optimistic cache patch', async () => {
        const { repository, placeSocketDataSource, placeLocalDataSource } = createRepository();
        placeLocalDataSource.cacheRead.mockResolvedValue({ id: 'place-1', name: 'Before' });
        placeSocketDataSource.updatePlace.mockRejectedValue(new Error('boom'));

        await expect(repository.updatePlace({ id: 'place-1', name: 'After' } as any)).rejects.toThrow('boom');

        // The final write should be the rollback to the original cached place snapshot.
        expect(placeLocalDataSource.cacheWrite).toHaveBeenLastCalledWith(
            expect.objectContaining({ id: 'place-1', name: 'Before' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });

    it('normalizes a sid-only update payload to carry id (= sid) for remote and optimistic cache', async () => {
        const { repository, placeSocketDataSource, placeLocalDataSource } = createRepository();
        placeLocalDataSource.cacheRead.mockResolvedValue({ id: 'site-7', name: 'Before' });
        placeSocketDataSource.updatePlace.mockResolvedValue({ id: 'site-7', name: 'After' });

        await repository.updatePlace({ sid: 'site-7', name: 'After' } as any);

        // The backend rejects place.update without @id, so the outgoing payload must carry it.
        expect(placeSocketDataSource.updatePlace).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'site-7', sid: 'site-7', name: 'After' }),
            expect.anything()
        );
        // The optimistic pre-write engages off the normalized id instead of being skipped.
        expect(placeLocalDataSource.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'site-7', name: 'After' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });

    it('writes ordered remote places into local cache during refreshList', async () => {
        const { repository, placeSocketDataSource, placeLocalDataSource } = createRepository();
        placeSocketDataSource.fetchPlace.mockResolvedValue({
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
        const { repository, placeSocketDataSource, placeLocalDataSource } = createRepository();
        placeSocketDataSource.createPlace.mockResolvedValue({ id: 'place-3', name: 'Created' });
        placeSocketDataSource.fetchPlace.mockResolvedValue({ list: [{ id: 'place-3', name: 'Created' }] });

        const result = await repository.createPlace({ name: 'Created' } as any);

        // A successful create should immediately hydrate the local read-model with the canonical server response.
        expect(placeLocalDataSource.cacheWrite).toHaveBeenCalledWith(expect.objectContaining({ id: 'place-3' }), {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
        expect(result).toEqual(expect.objectContaining({ id: 'place-3' }));
    });

    it('follows a successful create with an ordered snapshot that shields the new place from pruning', async () => {
        const { repository, placeSocketDataSource, placeLocalDataSource } = createRepository();
        placeSocketDataSource.createPlace.mockResolvedValue({ id: 'place-3', name: 'Created' });
        // The list response has not caught up with the just-created place yet.
        placeSocketDataSource.fetchPlace.mockResolvedValue({ list: [{ id: 'place-1', name: 'A' }] });
        placeLocalDataSource.cacheReadList.mockResolvedValue({
            list: [{ id: 'place-1' }, { id: 'place-3' }, { id: 'stale-row' }],
        });

        await repository.createPlace({ name: 'Created' } as any);

        // The follow-up snapshot lands with order stamps for every caller of createPlace.
        expect(placeLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [expect.objectContaining({ id: 'place-1', order: 0 })],
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        // Stale rows are pruned, but the just-created id is protected from the lagging list.
        expect(placeLocalDataSource.cacheDeleteMany).toHaveBeenCalledWith(['stale-row'], {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
    });

    it('still resolves createPlace when the follow-up snapshot fails', async () => {
        const { repository, placeSocketDataSource } = createRepository();
        placeSocketDataSource.createPlace.mockResolvedValue({ id: 'place-3', name: 'Created' });
        placeSocketDataSource.fetchPlace.mockRejectedValue(new Error('snapshot down'));

        // The place exists on the server; a failed snapshot must not fail the create.
        await expect(repository.createPlace({ name: 'Created' } as any)).resolves.toEqual(
            expect.objectContaining({ id: 'place-3' })
        );
    });

    it('prunes cached rows missing from a full refreshList snapshot', async () => {
        const { repository, placeSocketDataSource, placeLocalDataSource } = createRepository();
        placeSocketDataSource.fetchPlace.mockResolvedValue({ list: [{ id: 'place-1', name: 'A' }] });
        placeLocalDataSource.cacheReadList.mockResolvedValue({
            list: [{ id: 'place-1' }, { id: 'stale-default-place' }],
        });

        await repository.refreshList();

        // The server snapshot is authoritative: rows it no longer lists (e.g. an embedded-$site
        // default place written into a cloud partition) are removed.
        expect(placeLocalDataSource.cacheDeleteMany).toHaveBeenCalledWith(['stale-default-place'], {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
    });

    it('does not prune when refreshList was called with a filtering query', async () => {
        const { repository, placeSocketDataSource, placeLocalDataSource } = createRepository();
        placeSocketDataSource.fetchPlace.mockResolvedValue({ list: [{ id: 'place-1', name: 'A' }] });
        placeLocalDataSource.cacheReadList.mockResolvedValue({
            list: [{ id: 'place-1' }, { id: 'other-row' }],
        });

        await repository.refreshList({});

        // A filtered response proves nothing about the rows it omits.
        expect(placeLocalDataSource.cacheDeleteMany).not.toHaveBeenCalled();
    });

    it('leaves the cache entirely alone when the snapshot answers empty', async () => {
        const { repository, placeSocketDataSource, placeLocalDataSource } = createRepository();
        placeSocketDataSource.fetchPlace.mockResolvedValue({ list: [] });

        await repository.refreshList();

        // Right after a switch the session may answer empty; writing or pruning would wipe real rows.
        expect(placeLocalDataSource.cacheWriteMany).not.toHaveBeenCalled();
        expect(placeLocalDataSource.cacheDeleteMany).not.toHaveBeenCalled();
    });

    it('skips the snapshot entirely while the socket still serves another cloud', async () => {
        const { placeSocketDataSource, placeLocalDataSource } = createRepository();
        const repository = new PlaceRepositoryV2(placeSocketDataSource as any, placeLocalDataSource as any, {
            // cid already flipped optimistically, but the socket is still bound to the outgoing cloud.
            getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me', socketCid: 'cloud-b' }),
            setContext: () => undefined,
        });

        await repository.refreshList();

        expect(placeSocketDataSource.fetchPlace).not.toHaveBeenCalled();
        expect(placeLocalDataSource.cacheWriteMany).not.toHaveBeenCalled();
        expect(placeLocalDataSource.cacheDeleteMany).not.toHaveBeenCalled();
    });

    it('writes to the request-time snapshot even if the global context changes before remote resolve', async () => {
        const mutableContext = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };
        let resolveRemote: ((value: unknown) => void) | null = null;
        const placeSocketDataSource = {
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
        const repository = new PlaceRepositoryV2(placeSocketDataSource as any, placeLocalDataSource as any, {
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
        const placeSocketDataSource = {
            fetchPlace: jest.fn().mockResolvedValue({ list: [{ id: 'place-1', name: 'A' }] }),
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
            socketDataSources: {
                ...emptyRemote,
                place: placeSocketDataSource,
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

        expect(placeLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [expect.objectContaining({ id: 'place-1', order: 0 })],
            {
                cid: 'cloud-debug',
                sid: 'site-debug',
                uid: 'debugger',
            }
        );
    });
});

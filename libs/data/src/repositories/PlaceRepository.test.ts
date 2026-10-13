import { PlaceLocalDataSource } from '../local/data-sources/PlaceLocalDataSource';
import { createPartitionedMemoryStorage } from '../local/data-sources/__mocks__/MemoryCacheStorage';
import { PlaceRepository } from './PlaceRepository';
import { createRepositories } from './index';
import { ChannelRepository } from './ChannelRepository';
import { DataContextHolder } from './types';

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from '@chatic/bridges';

/** A channel clean-up for tests that never leave a place. */
const noChannelCleanup = () => ({ evictLeftChannels: jest.fn(), dropMemberFromChannels: jest.fn() });

describe('PlaceRepository', () => {
    const createRepository = () => {
        // Mock remote fetch/mutation calls independently from local cache writes to keep sequencing assertions simple.
        const placeSocketDataSource = {
            fetchPlace: jest.fn(),
            createPlace: jest.fn(),
            updatePlace: jest.fn(),
            deletePlace: jest.fn(),
            leavePlace: jest.fn(),
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
        const channelCleanup = noChannelCleanup();

        return {
            repository: new PlaceRepository(
                placeSocketDataSource as any,
                placeLocalDataSource as any,
                contextProvider,
                channelCleanup
            ),
            placeSocketDataSource,
            placeLocalDataSource,
            channelCleanup,
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

    it('drops the place from the cache once the server has deleted it', async () => {
        const { repository, placeSocketDataSource, placeLocalDataSource } = createRepository();
        const order: string[] = [];
        placeSocketDataSource.deletePlace.mockImplementation(async () => void order.push('remote'));
        placeLocalDataSource.cacheDelete.mockImplementation(async () => void order.push('cache'));

        await repository.deletePlace('place-1');

        expect(placeSocketDataSource.deletePlace).toHaveBeenCalledWith({ id: 'place-1' });
        expect(placeLocalDataSource.cacheDelete).toHaveBeenCalledWith('place-1', {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
        expect(order).toEqual(['remote', 'cache']);
    });

    it('drops the row from the cloud the delete started in, even when the scope moves before the answer', async () => {
        const placeSocketDataSource = { deletePlace: jest.fn() };
        const placeLocalDataSource = { cacheDelete: jest.fn() };
        let context = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };
        const repository = new PlaceRepository(
            placeSocketDataSource as any,
            placeLocalDataSource as any,
            {
                getContext: () => context,
                setContext: () => undefined,
            },
            noChannelCleanup()
        );
        // The session moves to another cloud while the server is still answering.
        placeSocketDataSource.deletePlace.mockImplementation(async () => {
            context = { cid: 'cloud-b', sid: 'site-9', uid: 'me-b' };
        });

        await repository.deletePlace('place-1');

        expect(placeLocalDataSource.cacheDelete).toHaveBeenCalledWith('place-1', {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
    });

    it('leaves the cache alone when the server refuses the delete', async () => {
        const { repository, placeSocketDataSource, placeLocalDataSource } = createRepository();
        placeSocketDataSource.deletePlace.mockRejectedValue(new Error('403 NOT ALLOWED'));

        await expect(repository.deletePlace('place-1')).rejects.toThrow('403 NOT ALLOWED');

        expect(placeLocalDataSource.cacheDelete).not.toHaveBeenCalled();
        expect(placeLocalDataSource.cacheWrite).not.toHaveBeenCalled();
    });

    describe('leavePlace', () => {
        const scope = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };

        it('clears the channels the server took me out of, then the place row, under the scope it was asked in', async () => {
            const { repository, placeSocketDataSource, placeLocalDataSource, channelCleanup } = createRepository();
            const answer = { siteId: 'place-1', leftChannelIds: ['ch-1', 'ch-2'], failedChannelIds: [] };
            const order: string[] = [];
            placeSocketDataSource.leavePlace.mockImplementation(async () => (order.push('remote'), answer));
            channelCleanup.evictLeftChannels.mockImplementation(async () => void order.push('channels'));
            placeLocalDataSource.cacheDelete.mockImplementation(async () => void order.push('place'));

            await expect(repository.leavePlace('place-1')).resolves.toEqual(answer);

            expect(placeSocketDataSource.leavePlace).toHaveBeenCalledWith({ id: 'place-1' });
            expect(channelCleanup.evictLeftChannels).toHaveBeenCalledWith(['ch-1', 'ch-2'], scope);
            expect(placeLocalDataSource.cacheDelete).toHaveBeenCalledWith('place-1', scope);
            expect(order).toEqual(['remote', 'channels', 'place']);
        });

        it('drops the row of the last place too — the empty list snapshot would never remove it', async () => {
            const { repository, placeSocketDataSource, placeLocalDataSource } = createRepository();
            placeSocketDataSource.leavePlace.mockResolvedValue({
                siteId: 'place-1',
                leftChannelIds: [],
                failedChannelIds: [],
            });
            placeSocketDataSource.fetchPlace.mockResolvedValue({ list: [] });

            await repository.leavePlace('place-1');
            await repository.refreshList();

            expect(placeLocalDataSource.cacheDelete).toHaveBeenCalledWith('place-1', scope);
            // The snapshot that follows is empty and, by design, touches nothing.
            expect(placeLocalDataSource.cacheDeleteMany).not.toHaveBeenCalled();
        });

        it('leaves the place and its channels cached and rethrows when the server refuses', async () => {
            const { repository, placeSocketDataSource, placeLocalDataSource, channelCleanup } = createRepository();
            placeSocketDataSource.leavePlace.mockRejectedValue(new Error('403 FORBIDDEN - owner cannot leave'));

            await expect(repository.leavePlace('place-1')).rejects.toThrow('403 FORBIDDEN');

            expect(channelCleanup.evictLeftChannels).not.toHaveBeenCalled();
            expect(placeLocalDataSource.cacheDelete).not.toHaveBeenCalled();
            expect(placeLocalDataSource.cacheWrite).not.toHaveBeenCalled();
        });

        it('succeeds when some channels could not be left, and logs them', async () => {
            const { repository, placeSocketDataSource, placeLocalDataSource, channelCleanup } = createRepository();
            (logger.warn as jest.Mock).mockClear();
            placeSocketDataSource.leavePlace.mockResolvedValue({
                siteId: 'place-1',
                leftChannelIds: ['ch-1'],
                failedChannelIds: ['ch-9'],
            });

            await repository.leavePlace('place-1');

            expect(channelCleanup.evictLeftChannels).toHaveBeenCalledWith(['ch-1'], scope);
            expect(placeLocalDataSource.cacheDelete).toHaveBeenCalledWith('place-1', scope);
            expect(logger.warn).toHaveBeenCalledWith(
                'PLACE',
                expect.any(String),
                expect.objectContaining({ data: expect.objectContaining({ failedChannelIds: ['ch-9'] }) })
            );
        });

        it('still succeeds, and still drops the place row, when clearing the channels fails locally', async () => {
            const { repository, placeSocketDataSource, placeLocalDataSource, channelCleanup } = createRepository();
            const answer = { siteId: 'place-1', leftChannelIds: ['ch-1'], failedChannelIds: [] };
            placeSocketDataSource.leavePlace.mockResolvedValue(answer);
            channelCleanup.evictLeftChannels.mockRejectedValue(new Error('IndexedDB is closed'));

            await expect(repository.leavePlace('place-1')).resolves.toEqual(answer);

            expect(placeLocalDataSource.cacheDelete).toHaveBeenCalledWith('place-1', scope);
        });

        it('cleans up the cloud the leave started in, even when the scope moves before the answer', async () => {
            const placeSocketDataSource = { leavePlace: jest.fn() };
            const placeLocalDataSource = { cacheDelete: jest.fn() };
            const channelCleanup = noChannelCleanup();
            let context = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };
            const repository = new PlaceRepository(
                placeSocketDataSource as any,
                placeLocalDataSource as any,
                { getContext: () => context, setContext: () => undefined },
                channelCleanup
            );
            placeSocketDataSource.leavePlace.mockImplementation(async () => {
                context = { cid: 'cloud-b', sid: 'site-9', uid: 'me-b' };
                return { siteId: 'place-1', leftChannelIds: ['ch-1'], failedChannelIds: [] };
            });

            await repository.leavePlace('place-1');

            expect(channelCleanup.evictLeftChannels).toHaveBeenCalledWith(['ch-1'], scope);
            expect(placeLocalDataSource.cacheDelete).toHaveBeenCalledWith('place-1', scope);
        });
    });

    describe('removeMember', () => {
        const scope = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };

        it('takes the member out of the rosters of the channels the server named, and keeps the place row', async () => {
            const { repository, placeSocketDataSource, placeLocalDataSource, channelCleanup } = createRepository();
            const answer = { siteId: 'place-1', leftChannelIds: ['ch-1', 'ch-2'], failedChannelIds: [] };
            placeSocketDataSource.leavePlace.mockResolvedValue(answer);

            await expect(repository.removeMember('place-1', 'u-2')).resolves.toEqual(answer);

            expect(placeSocketDataSource.leavePlace).toHaveBeenCalledWith({ id: 'place-1', userId: 'u-2' });
            expect(channelCleanup.dropMemberFromChannels).toHaveBeenCalledWith(['ch-1', 'ch-2'], 'u-2', scope);
            expect(channelCleanup.evictLeftChannels).not.toHaveBeenCalled();
            expect(placeLocalDataSource.cacheDelete).not.toHaveBeenCalled();
        });

        it('still succeeds when a roster cannot be corrected locally', async () => {
            const { repository, placeSocketDataSource, channelCleanup } = createRepository();
            const answer = { siteId: 'place-1', leftChannelIds: ['ch-1'], failedChannelIds: [] };
            placeSocketDataSource.leavePlace.mockResolvedValue(answer);
            channelCleanup.dropMemberFromChannels.mockRejectedValue(new Error('IndexedDB is closed'));

            await expect(repository.removeMember('place-1', 'u-2')).resolves.toEqual(answer);
        });

        it('touches no cache and rethrows when the server refuses', async () => {
            const { repository, placeSocketDataSource, channelCleanup } = createRepository();
            placeSocketDataSource.leavePlace.mockRejectedValue(new Error('403 FORBIDDEN - not the owner'));

            await expect(repository.removeMember('place-1', 'u-2')).rejects.toThrow('403 FORBIDDEN');

            expect(channelCleanup.dropMemberFromChannels).not.toHaveBeenCalled();
        });
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
        const repository = new PlaceRepository(
            placeSocketDataSource as any,
            placeLocalDataSource as any,
            {
                // cid already flipped optimistically, but the socket is still bound to the outgoing cloud.
                getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me', socketCid: 'cloud-b' }),
                setContext: () => undefined,
            },
            noChannelCleanup()
        );

        await repository.refreshList();

        expect(placeSocketDataSource.fetchPlace).not.toHaveBeenCalled();
        expect(placeLocalDataSource.cacheWriteMany).not.toHaveBeenCalled();
        expect(placeLocalDataSource.cacheDeleteMany).not.toHaveBeenCalled();
    });

    it('writes to the request-time snapshot even if the global context changes before remote resolve', async () => {
        const mutableContext = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };
        // The executor runs synchronously, so the resolver is assigned before anything below can
        // reach it — hence the definite assignment. Declaring it `| null = null` instead made the
        // control-flow analysis narrow it to `null` (an assignment inside a callback is not seen as
        // having run), and the call site below stopped typechecking.
        let resolveRemote!: (value: unknown) => void;
        const pendingRemote = new Promise(resolve => {
            resolveRemote = resolve;
        });
        const placeSocketDataSource = {
            fetchPlace: jest.fn().mockReturnValue(pendingRemote),
            createPlace: jest.fn(),
            updatePlace: jest.fn(),
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
        const repository = new PlaceRepository(
            placeSocketDataSource as any,
            placeLocalDataSource as any,
            {
                getContext: () => mutableContext,
                setContext: next => Object.assign(mutableContext, next),
            },
            noChannelCleanup()
        );

        const pending = repository.refreshList({});
        Object.assign(mutableContext, { cid: 'cloud-b', sid: 'site-9', uid: 'other' });
        resolveRemote({ list: [{ id: 'place-1', name: 'A' }] });

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
            updatePlace: jest.fn(),
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
        const repositories = createRepositories({
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

/**
 * The same late-answer race, with a real local data source on partitioned storage — the argument
 * assertion above shows what the repository asked for, this shows where the rows actually went.
 */
describe('PlaceRepository — the scope an answer is written under', () => {
    it('a list answered after a cloud and account switch lands in the partition that asked, and prunes only there', async () => {
        const context = new DataContextHolder({ cid: 'cloud-a', uid: 'me' });
        const places = createPartitionedMemoryStorage('site');
        await places
            .forScope({ cid: 'cloud-b', uid: 'other' })
            .save('b-place', { id: 'b-place', cid: 'cloud-b' } as any);
        let resolveRemote!: (value: unknown) => void;
        const socket = {
            fetchPlace: jest.fn(() => new Promise(resolve => (resolveRemote = resolve))),
        };
        const repository = new PlaceRepository(
            socket as any,
            new PlaceLocalDataSource(context, places),
            context,
            noChannelCleanup()
        );

        const pending = repository.refreshList();
        context.setContext({ cid: 'cloud-b', uid: 'other' });
        resolveRemote({ list: [{ id: 'a-place', name: 'A' }] });
        await pending;

        const idsIn = async (cid: string, uid: string) =>
            (await places.forScope({ cid, uid }).loadAll()).map(row => row.id);
        expect(await idsIn('cloud-a', 'me')).toEqual(['a-place']);
        // Neither written into, nor pruned against, the partition the session moved to.
        expect(await idsIn('cloud-b', 'other')).toEqual(['b-place']);
    });

    it('takes back a photo the refused update added to a place that had none', async () => {
        const context = new DataContextHolder({ cid: 'cloud-a', uid: 'me' });
        const places = createPartitionedMemoryStorage('site');
        await places.forScope({ cid: 'cloud-a', uid: 'me' }).save('place-1', { id: 'place-1', name: 'Design' } as any);
        const socket = { updatePlace: jest.fn().mockRejectedValue(new Error('403 NOT ALLOWED')) };
        const repository = new PlaceRepository(
            socket as any,
            new PlaceLocalDataSource(context, places),
            context,
            noChannelCleanup()
        );

        await expect(
            repository.updatePlace({ id: 'place-1', name: 'Studio', thumbnail: 'data:image/jpeg;base64,AAAA' } as any)
        ).rejects.toThrow('403 NOT ALLOWED');

        const row = await places.forScope({ cid: 'cloud-a', uid: 'me' }).load('place-1');
        expect(row?.name).toBe('Design');
        expect(row?.thumbnail).toBeUndefined();
    });
});

/**
 * Leaving a place, with the real channel repository behind it: the rows, the messages and the leave
 * guard are the channel side's, and this is where they are seen together.
 */
describe('PlaceRepository — leaving a place clears what the channel side holds', () => {
    const scope = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };
    const setup = () => {
        const contextProvider = { getContext: () => scope, setContext: () => undefined };
        const channelSocket = { fetchChannel: jest.fn(), leaveChannel: jest.fn() };
        const channelLocal = {
            cacheRead: jest.fn(async (id: string) =>
                id === 'ch-other' ? null : { id, sid: 'site-1', memberIds: ['me', 'u-2', 'u-3'] }
            ),
            cacheReadList: jest.fn(async () => ({ list: [] })),
            cacheWrite: jest.fn(),
            cacheWriteMany: jest.fn(),
            cacheDelete: jest.fn(),
            cacheDeleteMany: jest.fn(),
        };
        const chatLocal = { cacheClearByChannelId: jest.fn() };
        const channel = new ChannelRepository(
            channelSocket as any,
            channelLocal as any,
            chatLocal as any,
            contextProvider
        );
        const placeSocket = { leavePlace: jest.fn() };
        const placeLocal = { cacheDelete: jest.fn() };
        const place = new PlaceRepository(placeSocket as any, placeLocal as any, contextProvider, channel);
        return { channel, channelSocket, channelLocal, chatLocal, place, placeSocket, placeLocal };
    };

    it('a leave drops the place row, each left channel row and its messages, and guards them from a late snapshot', async () => {
        const { channel, channelSocket, channelLocal, chatLocal, place, placeSocket, placeLocal } = setup();
        placeSocket.leavePlace.mockResolvedValue({
            siteId: 'site-1',
            leftChannelIds: ['ch-1', 'ch-2'],
            failedChannelIds: [],
        });

        await place.leavePlace('site-1');

        expect(placeLocal.cacheDelete).toHaveBeenCalledWith('site-1', scope);
        expect(channelLocal.cacheDelete.mock.calls).toEqual([
            ['ch-1', scope],
            ['ch-2', scope],
        ]);
        expect(chatLocal.cacheClearByChannelId.mock.calls).toEqual([
            ['ch-1', scope],
            ['ch-2', scope],
        ]);

        // A list request that was already in flight answers with the old rooms: they stay out.
        channelSocket.fetchChannel.mockResolvedValue({
            list: [
                { id: 'ch-1', sid: 'site-1' },
                { id: 'ch-3', sid: 'site-1' },
            ],
        });
        await channel.refreshList({ sid: 'site-1' } as any);
        expect(channelLocal.cacheWriteMany).toHaveBeenCalledWith([{ id: 'ch-3', sid: 'site-1' }], scope);
    });

    it('a removal takes the member out of the cached rosters and skips a channel this device does not hold', async () => {
        const { channelLocal, chatLocal, place, placeSocket, placeLocal } = setup();
        placeSocket.leavePlace.mockResolvedValue({
            siteId: 'site-1',
            leftChannelIds: ['ch-1', 'ch-other'],
            failedChannelIds: [],
        });

        await place.removeMember('site-1', 'u-2');

        expect(channelLocal.cacheWrite.mock.calls).toEqual([[{ id: 'ch-1', memberIds: ['me', 'u-3'] }, scope]]);
        expect(channelLocal.cacheDelete).not.toHaveBeenCalled();
        expect(chatLocal.cacheClearByChannelId).not.toHaveBeenCalled();
        expect(placeLocal.cacheDelete).not.toHaveBeenCalled();
    });
});

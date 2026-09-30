import { SyncMetaRepository } from './SyncMetaRepository';
import { DataContextHolder } from './types';

import { SyncMetaLocalDataSource, type ISyncMetaLocalDataSource } from '../local/data-sources';
import { createPartitionedMemoryStorage } from '../local/data-sources/__mocks__/MemoryCacheStorage';

/**
 * The one local-only repository — no remote source. Every method hands the cursor straight to the
 * meta cache along with the graph's cloud and uid, so what these tests watch is that nothing is
 * rewritten on the way through and that the cursor lands in its own graph's partition.
 */
describe('SyncMetaRepository', () => {
    let localDataSource: jest.Mocked<ISyncMetaLocalDataSource>;
    let repository: SyncMetaRepository;

    beforeEach(() => {
        localDataSource = { getSyncedAt: jest.fn(), setSyncedAt: jest.fn(), cacheClear: jest.fn() };
        repository = new SyncMetaRepository(localDataSource, new DataContextHolder({ cid: 'cloud-a', uid: 'user-1' }));
    });

    it('getSyncedAt — passes the kind through and returns the stored cursor', async () => {
        localDataSource.getSyncedAt.mockResolvedValue(1_700_000_000_000);

        await expect(repository.getSyncedAt('channel-sync:cloud-a')).resolves.toBe(1_700_000_000_000);
        expect(localDataSource.getSyncedAt).toHaveBeenCalledWith('channel-sync:cloud-a', expect.anything());
    });

    it('getSyncedAt — a retired cursor reads as 0 and stays 0', async () => {
        // The data source answers 0 for an expired or routing-mismatched cursor, and callers read
        // that as "sync everything". Coercing it to anything else here would skip the re-sync.
        localDataSource.getSyncedAt.mockResolvedValue(0);

        await expect(repository.getSyncedAt('channel-sync:cloud-a')).resolves.toBe(0);
    });

    it('setSyncedAt — writes the cursor with both arguments untouched', async () => {
        localDataSource.setSyncedAt.mockResolvedValue(undefined);

        await repository.setSyncedAt('channel-sync:cloud-a', 42);

        expect(localDataSource.setSyncedAt).toHaveBeenCalledWith('channel-sync:cloud-a', 42, expect.anything());
    });

    it('hands the cache its own cloud and uid, not whichever the cache would pick', async () => {
        // The local data sources are shared by every graph and read the SELECTED scope on their own.
        // A graph built for another cloud has to say which partition its cursor belongs to.
        localDataSource.getSyncedAt.mockResolvedValue(7);
        localDataSource.setSyncedAt.mockResolvedValue(undefined);

        await repository.getSyncedAt('channel-sync:cloud-a');
        await repository.setSyncedAt('channel-sync:cloud-a', 7);

        expect(localDataSource.getSyncedAt).toHaveBeenCalledWith('channel-sync:cloud-a', {
            cid: 'cloud-a',
            uid: 'user-1',
        });
        expect(localDataSource.setSyncedAt).toHaveBeenCalledWith('channel-sync:cloud-a', 7, {
            cid: 'cloud-a',
            uid: 'user-1',
        });
    });

    it("a graph for one cloud keeps its cursor in that cloud's partition while another is selected", async () => {
        // The real data source over real partitions: the cache's own provider says cloud B is
        // selected, and a repository built for cloud A writes and reads its cursor.
        const metas = createPartitionedMemoryStorage('meta');
        const selectedB = new DataContextHolder({ cid: 'cloud-b', uid: 'user-b' });
        const shared = new SyncMetaLocalDataSource(selectedB, metas);
        const graphA = new SyncMetaRepository(shared, new DataContextHolder({ cid: 'cloud-a', uid: 'user-a' }));
        const graphB = new SyncMetaRepository(shared, selectedB);

        await graphA.setSyncedAt('channel-sync:cloud-a', 42);

        const partitionA = metas.forScope({ cid: 'cloud-a', uid: 'user-a' });
        const partitionB = metas.forScope({ cid: 'cloud-b', uid: 'user-b' });
        await expect(partitionA.load('channel-sync:cloud-a')).resolves.toEqual(
            expect.objectContaining({ cid: 'cloud-a', uid: 'user-a', syncedAt: 42 })
        );
        await expect(partitionB.load('channel-sync:cloud-a')).resolves.toBeNull();

        // Reads come from the same partition. The memory store stamps no save time, so the row is
        // re-seeded with one the way a real adapter would have written it.
        const now = Date.now();
        await partitionA.save('channel-sync:cloud-a', {
            id: 'channel-sync:cloud-a',
            syncedAt: 42,
            __cacheMeta: { lastSyncedAt: now, expiresAt: now + 60_000 },
        } as never);
        await expect(graphA.getSyncedAt('channel-sync:cloud-a')).resolves.toBe(42);
        await expect(graphB.getSyncedAt('channel-sync:cloud-a')).resolves.toBe(0);
    });

    it("cacheClear — clears its own graph's partition, not the selected one", async () => {
        localDataSource.cacheClear.mockResolvedValue(undefined);

        await repository.cacheClear();

        expect(localDataSource.cacheClear).toHaveBeenCalledWith({ cid: 'cloud-a', uid: 'user-1' });
    });

    it('lets a cache failure surface — a swallowed read would claim "already synced"', async () => {
        const error = new Error('cache unavailable');
        localDataSource.getSyncedAt.mockRejectedValue(error);

        await expect(repository.getSyncedAt('channel-sync:cloud-a')).rejects.toBe(error);
    });

    it('dispose() is inert — it holds nothing to release', () => {
        expect(() => repository.dispose()).not.toThrow();
    });
});

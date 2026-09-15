import { SyncMetaRepository } from './SyncMetaRepository';
import { DataContextHolder } from './types';

import type { ISyncMetaLocalDataSource } from '../local/data-sources';

/**
 * The one local-only repository — no remote source, no context normalization. Every method hands
 * the cursor straight to the meta cache, so what these tests watch is that nothing is rewritten on
 * the way through: the cursor's whole value is that it says what it says.
 */
describe('SyncMetaRepository', () => {
    let localDataSource: jest.Mocked<ISyncMetaLocalDataSource>;
    let repository: SyncMetaRepository;

    beforeEach(() => {
        localDataSource = { getSyncedAt: jest.fn(), setSyncedAt: jest.fn() };
        repository = new SyncMetaRepository(localDataSource, new DataContextHolder({ cid: 'cloud-a', uid: 'user-1' }));
    });

    it('getSyncedAt — passes the kind through and returns the stored cursor', async () => {
        localDataSource.getSyncedAt.mockResolvedValue(1_700_000_000_000);

        await expect(repository.getSyncedAt('channel-sync:cloud-a')).resolves.toBe(1_700_000_000_000);
        expect(localDataSource.getSyncedAt).toHaveBeenCalledWith('channel-sync:cloud-a');
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

        expect(localDataSource.setSyncedAt).toHaveBeenCalledWith('channel-sync:cloud-a', 42);
    });

    it('never reads the context — the cid/uid scope is the data source to apply', async () => {
        // Sibling repositories normalize cid/sid/uid before delegating. This one must not: the meta
        // cache is already scoped, and a second opinion here would only be able to disagree with it.
        const context = new DataContextHolder({ cid: 'cloud-a', uid: 'user-1' });
        const getContext = jest.spyOn(context, 'getContext');
        const scoped = new SyncMetaRepository(localDataSource, context);
        localDataSource.getSyncedAt.mockResolvedValue(7);
        localDataSource.setSyncedAt.mockResolvedValue(undefined);

        await scoped.getSyncedAt('channel-sync:cloud-a');
        await scoped.setSyncedAt('channel-sync:cloud-a', 7);

        expect(getContext).not.toHaveBeenCalled();
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

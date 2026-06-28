import type { CacheStorage } from '../storages';
import { SyncMetaLocalDataSourceV2 } from './SyncMetaLocalDataSourceV2';

describe('SyncMetaLocalDataSourceV2', () => {
    const createSource = (loaded?: { syncedAt?: number } | null) => {
        const save = jest.fn().mockResolvedValue(undefined);
        const storage = {
            load: jest.fn().mockResolvedValue(loaded ?? null),
            save,
        } as unknown as CacheStorage<'meta'>;
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', uid: 'me' }),
            setContext: () => undefined,
        };
        return { source: new SyncMetaLocalDataSourceV2(contextProvider, storage), save };
    };

    it('returns 0 when no cursor is stored', async () => {
        const { source } = createSource(null);
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(0);
    });

    it('returns the stored syncedAt', async () => {
        const { source } = createSource({ syncedAt: 1234 });
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(1234);
    });

    it('persists the cursor under cid/uid scope keyed by kind', async () => {
        const { source, save } = createSource(null);
        await source.setSyncedAt('channel-sync', 5678);
        expect(save).toHaveBeenCalledWith('channel-sync', {
            id: 'channel-sync',
            cid: 'cloud-a',
            uid: 'me',
            syncedAt: 5678,
        });
    });
});

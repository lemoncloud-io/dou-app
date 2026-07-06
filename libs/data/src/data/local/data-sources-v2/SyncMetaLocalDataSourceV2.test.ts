import type { CacheTtlMeta } from '@chatic/app-messages';
import type { CacheStorage } from '../storages';
import { SyncMetaLocalDataSourceV2 } from './SyncMetaLocalDataSourceV2';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('SyncMetaLocalDataSourceV2', () => {
    const createSource = (loaded?: { syncedAt?: number; __cacheMeta?: CacheTtlMeta } | null) => {
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

    // Adapters stamp __cacheMeta on save; tests reproduce it relative to now.
    const metaSavedAgo = (elapsedMs: number): CacheTtlMeta => {
        const lastSyncedAt = Date.now() - elapsedMs;
        return { lastSyncedAt, expiresAt: lastSyncedAt + DAY_MS };
    };

    it('저장된 커서가 없으면 0을 반환한다', async () => {
        const { source } = createSource(null);
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(0);
    });

    it('TTL 이내의 커서는 저장된 syncedAt을 반환한다', async () => {
        const { source } = createSource({ syncedAt: 1234, __cacheMeta: metaSavedAgo(60_000) });
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(1234);
    });

    it('TTL(1일)을 넘긴 커서는 만료로 보고 0을 반환한다', async () => {
        const { source } = createSource({ syncedAt: 1234, __cacheMeta: metaSavedAgo(DAY_MS + 60_000) });
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(0);
    });

    it('캐시 메타가 없는 커서(레거시 행)는 만료로 간주해 0을 반환한다', async () => {
        // Read-time expiry deliberately ignores the stored expiresAt so rows written under the
        // old "never expire" policy still fall back to a one-time full re-sync.
        const { source } = createSource({ syncedAt: 1234 });
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(0);
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

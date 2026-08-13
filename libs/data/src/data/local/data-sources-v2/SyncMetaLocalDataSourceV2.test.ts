import type { CacheTtlMeta } from '@chatic/app-messages';
import type { CacheStorage } from '../storages';
import { SyncMetaLocalDataSourceV2 } from './SyncMetaLocalDataSourceV2';

const MINUTE_MS = 60 * 1000;
// Mirror of the sync-cursor TTL in storages/utils (`meta`). Kept explicit so the test pins the
// intended window rather than tautologically re-deriving it from the code under test.
// Temporarily 5 minutes while data is migrating — restore to 30 with storages/utils.
const TTL_MS = 5 * MINUTE_MS;

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
        return { lastSyncedAt, expiresAt: lastSyncedAt + TTL_MS };
    };

    it('저장된 커서가 없으면 0을 반환한다', async () => {
        const { source } = createSource(null);
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(0);
    });

    it('TTL 이내의 커서는 저장된 syncedAt을 반환한다', async () => {
        const { source } = createSource({ syncedAt: 1234, __cacheMeta: metaSavedAgo(TTL_MS / 4) });
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(1234);
    });

    it('TTL을 넘긴 커서는 만료로 보고 0을 반환한다', async () => {
        const { source } = createSource({ syncedAt: 1234, __cacheMeta: metaSavedAgo(TTL_MS + 60_000) });
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(0);
    });

    // Regression: on the cold (native) cache the cursor survives app restarts, so a cursor idle
    // beyond the TTL used to be treated as valid (old 1-day window) — delta sync then replayed from a
    // `since` past the server window and the channel list stayed stale. It must now expire.
    it('오래 idle된 커서(cold 재오픈)는 만료로 보고 0을 반환한다', async () => {
        const { source } = createSource({ syncedAt: 1234, __cacheMeta: metaSavedAgo(6 * 60 * MINUTE_MS) });
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

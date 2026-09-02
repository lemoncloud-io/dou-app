import type { CacheTtlMeta } from '@chatic/app-messages';
import type { CacheStorage } from '../ports';
import { SyncMetaLocalDataSourceV2 } from './SyncMetaLocalDataSourceV2';

const MINUTE_MS = 60 * 1000;
// Mirror of the sync-cursor TTL in storages/utils (`meta`). Kept explicit so the test pins the
// intended window rather than tautologically re-deriving it from the code under test.
// Temporarily 5 minutes while data is migrating — restore to 30 with storages/utils.
const TTL_MS = 5 * MINUTE_MS;

describe('SyncMetaLocalDataSourceV2', () => {
    const createSource = (
        loaded?: { syncedAt?: number; routing?: string; __cacheMeta?: CacheTtlMeta } | null,
        routingFingerprint?: string
    ) => {
        const save = jest.fn().mockResolvedValue(undefined);
        const storage = {
            load: jest.fn().mockResolvedValue(loaded ?? null),
            save,
        } as unknown as CacheStorage<'meta'>;
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', uid: 'me' }),
            setContext: () => undefined,
        };
        return {
            source: new SyncMetaLocalDataSourceV2(contextProvider, storage, routingFingerprint),
            save,
        };
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

// A cursor is a claim about data in ANOTHER domain's store. When that domain moves stores — the
// gate raising a required contract version, or the emergency web pin — the cursor survives but the
// data does not follow it, so trusting it would mean asking for deltas after T over an empty store
// (ADR-0053).
describe('SyncMetaLocalDataSourceV2 — 라우팅이 바뀐 커서', () => {
    const ROUTING = 'chat:native,channel:native';
    const MOVED = 'chat:web,channel:native';

    const createSource = (
        loaded: { syncedAt?: number; routing?: string; __cacheMeta?: CacheTtlMeta } | null,
        routingFingerprint?: string
    ) => {
        const save = jest.fn().mockResolvedValue(undefined);
        const storage = {
            load: jest.fn().mockResolvedValue(loaded),
            save,
        } as unknown as CacheStorage<'meta'>;
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', uid: 'me' }),
            setContext: () => undefined,
        };
        return {
            source: new SyncMetaLocalDataSourceV2(contextProvider, storage, routingFingerprint),
            save,
        };
    };

    const fresh = (routing?: string) => ({
        syncedAt: 1234,
        routing,
        __cacheMeta: { lastSyncedAt: Date.now(), expiresAt: Date.now() + TTL_MS },
    });

    it('같은 라우팅에서 쓴 커서는 그대로 쓴다', async () => {
        const { source } = createSource(fresh(ROUTING), ROUTING);
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(1234);
    });

    it('라우팅이 달라졌으면 TTL이 남아 있어도 0으로 떨어뜨린다', async () => {
        const { source } = createSource(fresh(ROUTING), MOVED);
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(0);
    });

    // 지문이 생기기 전에 쓰인 행. 현재 라우팅을 설명한다고 볼 근거가 없으므로 함께 은퇴한다 —
    // 배포 직후 전체 재동기화 1회가 대가다.
    it('지문이 없는 구버전 커서도 0으로 떨어뜨린다', async () => {
        const { source } = createSource(fresh(undefined), ROUTING);
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(0);
    });

    // 조립부가 지문을 주지 않는 경우(주입된 스토리지 팩토리, 테스트). 검사 자체를 끈다.
    it('지문이 주어지지 않으면 검사하지 않는다', async () => {
        const { source } = createSource(fresh(undefined), undefined);
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(1234);
    });

    it('커서를 쓸 때 현재 라우팅 지문을 함께 남긴다', async () => {
        const { source, save } = createSource(null, ROUTING);
        await source.setSyncedAt('channel-sync', 5678);
        expect(save).toHaveBeenCalledWith('channel-sync', {
            id: 'channel-sync',
            cid: 'cloud-a',
            uid: 'me',
            syncedAt: 5678,
            routing: ROUTING,
        });
    });
});

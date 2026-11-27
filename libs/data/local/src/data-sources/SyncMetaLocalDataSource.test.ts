import type { CacheTtlMeta } from '@chatic/bridge-messages';
import { logger } from '@chatic/logger';
import { SyncMetaLocalDataSource } from './SyncMetaLocalDataSource';
import { createPartitionedMemoryStorage } from '../testing';

jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const MINUTE_MS = 60 * 1000;
const TTL_MS = 30 * MINUTE_MS;

const CONTEXT = { cid: 'cloud-a', uid: 'me' };

const createSource = (
    loaded?: { syncedAt?: number; routing?: string; __cacheMeta?: CacheTtlMeta } | null,
    routingFingerprint?: string
) => {
    const metas = createPartitionedMemoryStorage('meta');
    const storage = metas.forScope(CONTEXT);
    jest.spyOn(storage, 'load').mockResolvedValue((loaded ?? null) as never);
    const save = jest.spyOn(storage, 'save');
    const provider = { getContext: () => CONTEXT, setContext: () => undefined };
    return { source: new SyncMetaLocalDataSource(provider, metas, routingFingerprint), save };
};

describe('SyncMetaLocalDataSource', () => {
    const metaSavedAgo = (elapsedMs: number): CacheTtlMeta => {
        const lastSyncedAt = Date.now() - elapsedMs;
        return { lastSyncedAt, expiresAt: lastSyncedAt + TTL_MS };
    };

    it('returns 0 when no cursor is stored', async () => {
        const { source } = createSource(null);
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(0);
    });

    it('a cursor within TTL returns the stored syncedAt', async () => {
        const { source } = createSource({ syncedAt: 1234, __cacheMeta: metaSavedAgo(TTL_MS / 4) });
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(1234);
    });

    it('a cursor past TTL is treated as expired and returns 0', async () => {
        const { source } = createSource({ syncedAt: 1234, __cacheMeta: metaSavedAgo(TTL_MS + 60_000) });
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(0);
    });

    it('a long-idle cursor (a cold reopen) is treated as expired and returns 0', async () => {
        const { source } = createSource({ syncedAt: 1234, __cacheMeta: metaSavedAgo(6 * 60 * MINUTE_MS) });
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(0);
    });

    it('a cursor with no cache metadata (a legacy row) is treated as expired and returns 0', async () => {
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

describe('SyncMetaLocalDataSource — a cursor whose routing changed', () => {
    const ROUTING = 'chat:native,channel:native';
    const MOVED = 'chat:web,channel:native';

    const fresh = (routing?: string) => ({
        syncedAt: 1234,
        routing,
        __cacheMeta: { lastSyncedAt: Date.now(), expiresAt: Date.now() + TTL_MS },
    });

    it('a cursor written under the same routing is used as is', async () => {
        const { source } = createSource(fresh(ROUTING), ROUTING);
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(1234);
    });

    it('when the routing differs it drops to 0 even with TTL left', async () => {
        const { source } = createSource(fresh(ROUTING), MOVED);
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(0);
    });

    it('an older cursor with no fingerprint also drops to 0', async () => {
        const { source } = createSource(fresh(undefined), ROUTING);
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(0);
    });

    it('no check is made when no fingerprint is given', async () => {
        const { source } = createSource(fresh(undefined), undefined);
        await expect(source.getSyncedAt('channel-sync')).resolves.toBe(1234);
    });

    it('writing a cursor records the current routing fingerprint with it', async () => {
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

describe('SyncMetaLocalDataSource — a cursor from before a cache clear', () => {
    const warn = logger.warn as jest.Mock;
    const savedAt = (lastSyncedAt: number) => ({
        syncedAt: 1234,
        __cacheMeta: { lastSyncedAt, expiresAt: lastSyncedAt + TTL_MS },
    });
    const sourceWith = (row: ReturnType<typeof savedAt>, validAfter: () => number) => {
        const metas = createPartitionedMemoryStorage('meta');
        jest.spyOn(metas.forScope(CONTEXT), 'load').mockResolvedValue(row as never);
        const provider = { getContext: () => CONTEXT, setContext: () => undefined };
        return new SyncMetaLocalDataSource(provider, metas, undefined, validAfter);
    };

    beforeEach(() => jest.clearAllMocks());

    it('a cursor saved before the watermark drops to 0 and says why', async () => {
        const now = Date.now();
        const source = sourceWith(savedAt(now - 1_000), () => now);

        await expect(source.getSyncedAt('channel-sync:cloud-a')).resolves.toBe(0);
        expect(warn).toHaveBeenCalledWith('SYNC', expect.any(String), {
            observation: 'sync-cursor-retired',
            cursorKind: 'channel-sync:cloud-a',
            reason: 'cache-cleared',
        });
    });

    it('a cursor saved after the watermark is kept', async () => {
        const now = Date.now();
        const source = sourceWith(savedAt(now), () => now - 1_000);

        await expect(source.getSyncedAt('channel-sync:cloud-a')).resolves.toBe(1234);
    });

    it('reads the watermark on every call, so a later clear retires a cursor trusted earlier', async () => {
        const now = Date.now();
        let validAfter = 0;
        const source = sourceWith(savedAt(now - 1_000), () => validAfter);

        await expect(source.getSyncedAt('channel-sync:cloud-a')).resolves.toBe(1234);
        validAfter = now;
        await expect(source.getSyncedAt('channel-sync:cloud-a')).resolves.toBe(0);
    });
});

describe('SyncMetaLocalDataSource — recording a discarded cursor (ADR-0099)', () => {
    const ROUTING = 'chat:native,channel:native';
    const warn = logger.warn as jest.Mock;

    beforeEach(() => jest.clearAllMocks());

    it('discarding on a changed routing fingerprint is recorded with the reason', async () => {
        const { source } = createSource({ syncedAt: 1234, routing: 'old-routing' }, ROUTING);

        await expect(source.getSyncedAt('channel-sync:cloud-a')).resolves.toBe(0);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toBe('SYNC');
        expect(warn.mock.calls[0][2]).toEqual({
            observation: 'sync-cursor-retired',
            cursorKind: 'channel-sync:cloud-a',
            reason: 'routing-changed',
        });
    });

    it('discarding on TTL expiry is recorded under a different reason', async () => {
        const stale = { lastSyncedAt: Date.now() - 60 * 60 * 1000 } as CacheTtlMeta;
        const { source } = createSource({ syncedAt: 1234, routing: ROUTING, __cacheMeta: stale }, ROUTING);

        await expect(source.getSyncedAt('profile-sync:cloud-a:s1')).resolves.toBe(0);
        expect(warn.mock.calls[0][2]).toEqual({
            observation: 'sync-cursor-retired',
            cursorKind: 'profile-sync:cloud-a:s1',
            reason: 'expired',
        });
    });

    it('nothing is recorded when there is no row (a first sync)', async () => {
        const { source } = createSource(null, ROUTING);

        await expect(source.getSyncedAt('channel-sync:cloud-a')).resolves.toBe(0);
        expect(warn).not.toHaveBeenCalled();
    });

    it('nothing is recorded when a valid cursor is read', async () => {
        const meta = { lastSyncedAt: Date.now() } as CacheTtlMeta;
        const { source } = createSource({ syncedAt: 1234, routing: ROUTING, __cacheMeta: meta }, ROUTING);

        await expect(source.getSyncedAt('channel-sync:cloud-a')).resolves.toBe(1234);
        expect(warn).not.toHaveBeenCalled();
    });

    it("an override reads and writes the partition it names, not the provider's", async () => {
        const metas = createPartitionedMemoryStorage('meta');
        const provider = { getContext: () => ({ cid: 'cloud-b', uid: 'user-b' }), setContext: () => undefined };
        const source = new SyncMetaLocalDataSource(provider, metas);

        await source.setSyncedAt('channel-sync:cloud-a', 42, { cid: 'cloud-a', uid: 'user-a' });

        await expect(metas.forScope({ cid: 'cloud-a', uid: 'user-a' }).load('channel-sync:cloud-a')).resolves.toEqual(
            expect.objectContaining({ cid: 'cloud-a', uid: 'user-a', syncedAt: 42 })
        );
        await expect(
            metas.forScope({ cid: 'cloud-b', uid: 'user-b' }).load('channel-sync:cloud-a')
        ).resolves.toBeNull();

        const load = jest.spyOn(metas.forScope({ cid: 'cloud-a', uid: 'user-a' }), 'load');
        await source.getSyncedAt('channel-sync:cloud-a', { cid: 'cloud-a', uid: 'user-a' });
        expect(load).toHaveBeenCalledWith('channel-sync:cloud-a');
    });

    it('cacheClear empties the partition it names and leaves every other one alone', async () => {
        const metas = createPartitionedMemoryStorage('meta');
        const provider = { getContext: () => ({ cid: 'cloud-b', uid: 'user-b' }), setContext: () => undefined };
        const source = new SyncMetaLocalDataSource(provider, metas);
        await source.setSyncedAt('channel-sync:cloud-a', 42, { cid: 'cloud-a', uid: 'user-a' });
        await source.setSyncedAt('channel-sync:cloud-b', 7);

        await source.cacheClear({ cid: 'cloud-a', uid: 'user-a' });

        await expect(
            metas.forScope({ cid: 'cloud-a', uid: 'user-a' }).load('channel-sync:cloud-a')
        ).resolves.toBeNull();
        await expect(metas.forScope({ cid: 'cloud-b', uid: 'user-b' }).load('channel-sync:cloud-b')).resolves.toEqual(
            expect.objectContaining({ syncedAt: 7 })
        );
    });
});

import type { CacheModelOf } from '@chatic/bridge-messages';
import type { CacheStorage } from '@chatic/data';
import { INVITED_CLOUD_IMPORT_MARKER_KEY, InvitedCloudImportStorage } from './invitedCloudSessionImport';

jest.mock('@chatic/bridges', () => ({
    ...jest.requireActual('@chatic/bridges'),
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type Row = CacheModelOf<'invitecloud'>;

const row = (id: string, acceptedBy?: string[], overrides: Partial<Row> = {}): Row =>
    ({ id, cid: id, name: `cloud-${id}`, cloudType: 'invited', acceptedBy, ...overrides }) as Row;

/**
 * The tab store, in memory. `@chatic/db` is constructed by `localFactory` alone, so the real adapter
 * is not imported here; its own suite covers it.
 */
const memoryStore = (): CacheStorage<'invitecloud'> => {
    const rows = new Map<string, Row>();
    return {
        save: async (id, item) => {
            rows.set(id, item);
            return item;
        },
        saveAll: async items => {
            items.forEach(item => rows.set(item.id, item));
            return items;
        },
        load: async id => rows.get(id) ?? null,
        loadMany: async ids => ids.map(id => rows.get(id)).filter((item): item is Row => !!item),
        loadAll: async () => [...rows.values()],
        delete: async id => void rows.delete(id),
        deleteAll: async ids => ids.forEach(id => rows.delete(id)),
        clearAll: async () => rows.clear(),
        clearByChannelId: async () => undefined,
    };
};

/** A legacy (IndexedDB) store stand-in: only `loadAll` is read by the import. */
const legacyHolding = (rows: Row[]) => {
    const loadAll = jest.fn().mockResolvedValue(rows);
    return { store: { loadAll } as unknown as CacheStorage<'invitecloud'>, loadAll };
};

const idsOf = (rows: Row[]) => rows.map(item => item.id).sort();

describe('InvitedCloudImportStorage', () => {
    let target: CacheStorage<'invitecloud'>;

    beforeEach(() => {
        sessionStorage.clear();
        target = memoryStore();
    });

    const wrap = (legacy: CacheStorage<'invitecloud'>, delegatorId: string | null, recorded: string[] = []) =>
        new InvitedCloudImportStorage(target, () => legacy, {
            marker: sessionStorage,
            getDelegatorId: () => delegatorId,
            getRecordedCloudIds: () => recorded,
        });

    it("carries over only the rows this tab's guest accepted", async () => {
        const legacy = legacyHolding([
            row('mine', ['guest-1']),
            row('shared', ['guest-0', 'guest-1']),
            row('theirs', ['guest-2']),
            row('unattributed'),
        ]);

        const storage = wrap(legacy.store, 'guest-1');

        expect(idsOf(await storage.loadAll())).toEqual(['mine', 'shared']);
    });

    // desktop-web writes no `acceptedBy`; the tab's recorded uid in the cloud is its proof of entry.
    it('carries over an unattributed row the tab session holds a uid in', async () => {
        const legacy = legacyHolding([row('entered'), row('unattributed')]);

        const storage = wrap(legacy.store, 'guest-1', ['entered']);

        expect(idsOf(await storage.loadAll())).toEqual(['entered']);
    });

    it('imports nothing and reads nothing for a tab with neither a guest nor a recorded cloud', async () => {
        const legacy = legacyHolding([row('mine', ['guest-1'])]);

        expect(await wrap(legacy.store, null).loadAll()).toEqual([]);
        expect(legacy.loadAll).not.toHaveBeenCalled();
    });

    // An account session or a post-logout reload has no guest id yet; the guest that returns with the
    // tab's device id must still find its rows on a later boot.
    it('leaves the marker unset when the pass ran without a guest, so a later boot retries', async () => {
        const legacy = legacyHolding([row('mine', ['guest-1']), row('entered')]);

        expect(idsOf(await wrap(legacy.store, null, ['entered']).loadAll())).toEqual(['entered']);
        expect(sessionStorage.getItem(INVITED_CLOUD_IMPORT_MARKER_KEY)).toBeNull();

        expect(idsOf(await wrap(legacy.store, 'guest-1').loadAll())).toEqual(['entered', 'mine']);
        expect(sessionStorage.getItem(INVITED_CLOUD_IMPORT_MARKER_KEY)).toBe('1');
    });

    it('runs once per guest tab, so a removed row is not brought back on the next boot', async () => {
        const legacy = legacyHolding([row('mine', ['guest-1'])]);
        const firstBoot = wrap(legacy.store, 'guest-1');
        await firstBoot.loadAll();
        await firstBoot.delete('mine');

        const nextBoot = wrap(legacy.store, 'guest-1');

        expect(await nextBoot.loadAll()).toEqual([]);
        expect(legacy.loadAll).toHaveBeenCalledTimes(1);
    });

    it('keeps a row the tab store already holds over the IndexedDB copy', async () => {
        await target.save('mine', row('mine', ['guest-1'], { name: 'fresh' }));
        const legacy = legacyHolding([row('mine', ['guest-1'], { name: 'stale' })]);

        const storage = wrap(legacy.store, 'guest-1');

        expect(await storage.load('mine')).toMatchObject({ name: 'fresh' });
    });

    it('lands the import before a write, so the write is not overwritten', async () => {
        const legacy = legacyHolding([row('mine', ['guest-1'], { name: 'stale' })]);
        const storage = wrap(legacy.store, 'guest-1');

        await storage.save('mine', row('mine', ['guest-1'], { name: 'written' }));

        expect(await storage.load('mine')).toMatchObject({ name: 'written' });
    });

    it('runs the pass once for concurrent first calls', async () => {
        const legacy = legacyHolding([row('mine', ['guest-1'])]);
        const storage = wrap(legacy.store, 'guest-1');

        await Promise.all([storage.loadAll(), storage.load('mine'), storage.loadMany(['mine'])]);

        expect(legacy.loadAll).toHaveBeenCalledTimes(1);
    });

    it('leaves the marker unset when the IndexedDB read fails, and still serves the tab store', async () => {
        await target.save('kept', row('kept', ['guest-1']));
        const failing = { loadAll: jest.fn().mockRejectedValue(new Error('blocked')) };

        const storage = wrap(failing as unknown as CacheStorage<'invitecloud'>, 'guest-1');

        expect(idsOf(await storage.loadAll())).toEqual(['kept']);
        expect(sessionStorage.getItem(INVITED_CLOUD_IMPORT_MARKER_KEY)).toBeNull();
    });

    it('passes every operation through to the tab store', async () => {
        const storage = wrap(legacyHolding([]).store, 'guest-1');

        await storage.saveAll([row('a'), row('b'), row('c')]);
        await storage.delete('a');
        await storage.deleteAll(['b']);

        expect(idsOf(await target.loadAll())).toEqual(['c']);
    });
});

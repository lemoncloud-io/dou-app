import { logger } from '@chatic/bridges';
import { WebStorageAdapter } from './WebStorageAdapter';

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const scopeOf = (cid: string, uid: string) => ({ getContext: () => ({ cid, uid }), setContext: () => undefined });

const cloud = (id: string, overrides: Record<string, unknown> = {}) =>
    ({ id, cid: id, name: `cloud-${id}`, cloudType: 'invited', ...overrides }) as any;

const idsOf = (items: Array<{ id: string }>) => items.map(item => item.id).sort();

describe('WebStorageAdapter', () => {
    beforeEach(() => {
        sessionStorage.clear();
        localStorage.clear();
        jest.clearAllMocks();
    });

    it('saves, loads and lists rows within one partition', async () => {
        const adapter = new WebStorageAdapter(sessionStorage, 'invitecloud', scopeOf('any', 'any'));

        await adapter.save('a', cloud('a'));
        await adapter.saveAll([cloud('b'), cloud('c')]);

        expect(await adapter.load('a')).toMatchObject({ id: 'a', name: 'cloud-a' });
        expect(await adapter.load('missing')).toBeNull();
        expect(idsOf(await adapter.loadAll())).toEqual(['a', 'b', 'c']);
    });

    it('stamps the TTL metadata the other adapters stamp', async () => {
        const adapter = new WebStorageAdapter(sessionStorage, 'invitecloud', scopeOf('any', 'any'));

        await adapter.save('a', cloud('a'));

        expect((await adapter.load('a')) as any).toHaveProperty('__cacheMeta');
    });

    it('overwrites a row saved again under the same id', async () => {
        const adapter = new WebStorageAdapter(sessionStorage, 'invitecloud', scopeOf('any', 'any'));

        await adapter.save('a', cloud('a', { name: 'old' }));
        await adapter.save('a', cloud('a', { name: 'new' }));

        expect(await adapter.loadAll()).toHaveLength(1);
        expect(await adapter.load('a')).toMatchObject({ name: 'new' });
    });

    it('deletes rows by id and clears the partition', async () => {
        const adapter = new WebStorageAdapter(sessionStorage, 'invitecloud', scopeOf('any', 'any'));
        await adapter.saveAll([cloud('a'), cloud('b'), cloud('c')]);

        await adapter.delete('a');
        await adapter.deleteAll(['b']);
        expect(idsOf(await adapter.loadAll())).toEqual(['c']);

        await adapter.clearAll();
        expect(await adapter.loadAll()).toEqual([]);
        expect(sessionStorage.length).toBe(0);
    });

    it('writes only to the storage area it was given', async () => {
        const adapter = new WebStorageAdapter(sessionStorage, 'invitecloud', scopeOf('any', 'any'));

        await adapter.save('a', cloud('a'));

        expect(sessionStorage.length).toBe(1);
        expect(localStorage.length).toBe(0);
    });

    // invitecloud's policy pins one global partition whatever the session says, so two adapters with
    // different contexts read the same rows — the same answer the IndexedDB adapter gives.
    it('follows the domain scope policy rather than the raw context', async () => {
        const first = new WebStorageAdapter(sessionStorage, 'invitecloud', scopeOf('c1', 'u1'));
        const second = new WebStorageAdapter(sessionStorage, 'invitecloud', scopeOf('c2', 'u2'));

        await first.save('a', cloud('a'));

        expect(await second.load('a')).toMatchObject({ id: 'a' });
    });

    it('keeps partitions apart for a domain scoped by session', async () => {
        const one = new WebStorageAdapter(sessionStorage, 'site', scopeOf('c1', 'u1'));
        const other = new WebStorageAdapter(sessionStorage, 'site', scopeOf('c1', 'u2'));

        await one.save('s1', { id: 's1' } as any);

        expect(await other.loadAll()).toEqual([]);
    });

    it('skips every operation when the domain has no session scope', async () => {
        const adapter = new WebStorageAdapter(sessionStorage, 'site', scopeOf('c1', ''));

        await adapter.save('s1', { id: 's1' } as any);

        expect(sessionStorage.length).toBe(0);
        expect(await adapter.loadAll()).toEqual([]);
    });

    it('drops an item with no id from saveAll and says so', async () => {
        const adapter = new WebStorageAdapter(sessionStorage, 'invitecloud', scopeOf('any', 'any'));

        await adapter.saveAll([cloud('a'), { name: 'no id' } as any]);

        expect(idsOf(await adapter.loadAll())).toEqual(['a']);
        expect(logger.warn).toHaveBeenCalledWith('CACHE', expect.stringContaining('dropped 1 item'), expect.anything());
    });

    it('reads an unparseable partition as empty and recovers on the next write', async () => {
        const adapter = new WebStorageAdapter(sessionStorage, 'invitecloud', scopeOf('any', 'any'));
        await adapter.save('a', cloud('a'));
        const key = sessionStorage.key(0)!;
        sessionStorage.setItem(key, '{not json');

        expect(await adapter.loadAll()).toEqual([]);
        expect(logger.warn).toHaveBeenCalled();

        await adapter.save('b', cloud('b'));
        expect(idsOf(await adapter.loadAll())).toEqual(['b']);
    });

    it('reads a partition holding a non-object value as empty', async () => {
        const adapter = new WebStorageAdapter(sessionStorage, 'invitecloud', scopeOf('any', 'any'));
        await adapter.save('a', cloud('a'));
        sessionStorage.setItem(sessionStorage.key(0)!, '[1,2]');

        expect(await adapter.loadAll()).toEqual([]);
    });
});

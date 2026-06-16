import 'fake-indexeddb/auto';
import { IndexedDBDatabase } from '../databases';
import { IndexedDBAdapter } from './IndexedDBAdapter';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

if (typeof globalThis.structuredClone !== 'function') {
    globalThis.structuredClone = ((value: unknown) => clone(value)) as typeof structuredClone;
}

const chat = (id: string, overrides: Record<string, unknown> = {}) =>
    ({
        id,
        cid: 'model-cid',
        channelId: 'channel-main',
        text: `chat-${id}`,
        createdAt: 1,
        updatedAt: 1,
        ...overrides,
    }) as any;

describe('IndexedDBAdapter', () => {
    let db: IndexedDBDatabase;

    beforeEach(() => {
        db = new IndexedDBDatabase();
    });

    it('isolates records by cid+uid scope', async () => {
        const contextA = { getContext: () => ({ cid: 'cloud-a', uid: 'user-a' }), setContext: () => undefined };
        const contextB = { getContext: () => ({ cid: 'cloud-a', uid: 'user-b' }), setContext: () => undefined };

        const storageA = new IndexedDBAdapter(db, 'chat', contextA);
        const storageB = new IndexedDBAdapter(db, 'chat', contextB);

        await storageA.save('A1', chat('A1', { text: 'from-a' }));
        await storageB.save('B1', chat('B1', { text: 'from-b' }));

        expect(await storageA.loadAll()).toMatchObject([chat('A1', { text: 'from-a' })]);
        expect(await storageB.loadAll()).toMatchObject([chat('B1', { text: 'from-b' })]);
    });

    it('reads latest cid/uid from contextProvider at call-time', async () => {
        const context = { cid: 'cloud-a', uid: 'user-a' };
        const contextProvider = {
            getContext: () => ({ cid: context.cid, uid: context.uid }),
            setContext: (next: { cid: string; uid: string }) => {
                context.cid = next.cid;
                context.uid = next.uid;
            },
        };

        const storage = new IndexedDBAdapter(db, 'chat', contextProvider);
        await storage.save('A1', chat('A1', { text: 'from-a' }));

        contextProvider.setContext({ cid: 'cloud-b', uid: 'user-b' });
        await storage.save('B1', chat('B1', { text: 'from-b' }));

        expect(await storage.loadAll()).toMatchObject([chat('B1', { text: 'from-b' })]);

        contextProvider.setContext({ cid: 'cloud-a', uid: 'user-a' });
        expect(await storage.loadAll()).toMatchObject([chat('A1', { text: 'from-a' })]);
    });

    it('evicts oldest chats and retries the write on QuotaExceededError', async () => {
        const ctx = { getContext: () => ({ cid: 'c', uid: 'u' }), setContext: () => undefined };

        // Seed 100 chats (chat_no 1..100) straight through the real db.
        const seeder = new IndexedDBAdapter(db, 'chat', ctx);
        await seeder.saveAll(Array.from({ length: 100 }, (_, i) => chat(`c${i + 1}`, { chatNo: i + 1 })) as any);

        // Wrap the db so the next save throws a quota error exactly once.
        let failed = false;
        const quotaDb = new Proxy(db, {
            get(target, prop, recv) {
                if (prop === 'save' || prop === 'saveAll') {
                    return async (...args: unknown[]) => {
                        if (!failed) {
                            failed = true;
                            throw new DOMException('quota', 'QuotaExceededError');
                        }
                        return (target as any)[prop](...args);
                    };
                }
                const value = Reflect.get(target, prop, recv);
                return typeof value === 'function' ? value.bind(target) : value;
            },
        }) as IndexedDBDatabase;

        const storage = new IndexedDBAdapter(quotaDb, 'chat', ctx);
        await storage.save('new', chat('new', { chatNo: 101 }));

        const all = (await seeder.loadAll()) as Array<{ id: string }>;
        // 100 seeded − 50 oldest evicted + 1 new = 51
        expect(all).toHaveLength(51);
        expect(all.find(c => c.id === 'new')).toBeTruthy();
        expect(all.find(c => c.id === 'c1')).toBeFalsy(); // oldest evicted
        expect(all.find(c => c.id === 'c100')).toBeTruthy(); // newest kept
    });

    it('clearAll affects only current cid+uid scope', async () => {
        const scopeMain = { getContext: () => ({ cid: 'main', uid: 'u1' }), setContext: () => undefined };
        const scopeOther = { getContext: () => ({ cid: 'main', uid: 'u2' }), setContext: () => undefined };

        const main = new IndexedDBAdapter(db, 'chat', scopeMain);
        const other = new IndexedDBAdapter(db, 'chat', scopeOther);

        await main.saveAll([chat('M1'), chat('M2')] as any);
        await other.save('O1', chat('O1'));

        await main.clearAll();
        expect(await main.loadAll()).toEqual([]);
        expect(await other.loadAll()).toMatchObject([chat('O1')]);
    });
});

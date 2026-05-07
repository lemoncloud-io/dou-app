import 'fake-indexeddb/auto';

import { createIndexedDBAdapter } from './indexedDBAdapter';

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

describe('createIndexedDBAdapter', () => {
    it('isolates records by cid+uid scope', async () => {
        const contextA = { getContext: () => ({ cid: 'cloud-a', uid: 'user-a' }), setContext: () => undefined };
        const contextB = { getContext: () => ({ cid: 'cloud-a', uid: 'user-b' }), setContext: () => undefined };

        const storageA = createIndexedDBAdapter('chat', contextA);
        const storageB = createIndexedDBAdapter('chat', contextB);

        await storageA.save('A1', chat('A1', { text: 'from-a' }));
        await storageB.save('B1', chat('B1', { text: 'from-b' }));

        expect(await storageA.loadAll()).toEqual([chat('A1', { text: 'from-a' })]);
        expect(await storageB.loadAll()).toEqual([chat('B1', { text: 'from-b' })]);
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

        const storage = createIndexedDBAdapter('chat', contextProvider);
        await storage.save('A1', chat('A1', { text: 'from-a' }));

        contextProvider.setContext({ cid: 'cloud-b', uid: 'user-b' });
        await storage.save('B1', chat('B1', { text: 'from-b' }));

        expect(await storage.loadAll()).toEqual([chat('B1', { text: 'from-b' })]);

        contextProvider.setContext({ cid: 'cloud-a', uid: 'user-a' });
        expect(await storage.loadAll()).toEqual([chat('A1', { text: 'from-a' })]);
    });

    it('replaceAll and clearAll affect only current cid+uid scope', async () => {
        const scopeMain = { getContext: () => ({ cid: 'main', uid: 'u1' }), setContext: () => undefined };
        const scopeOther = { getContext: () => ({ cid: 'main', uid: 'u2' }), setContext: () => undefined };
        const main = createIndexedDBAdapter('chat', scopeMain);
        const other = createIndexedDBAdapter('chat', scopeOther);

        await main.saveAll([chat('M1'), chat('M2')] as any);
        await other.save('O1', chat('O1'));

        await main.replaceAll([chat('M3')] as any);
        expect(await main.loadAll()).toEqual([chat('M3')]);
        expect(await other.loadAll()).toEqual([chat('O1')]);

        await main.clearAll();
        expect(await main.loadAll()).toEqual([]);
        expect(await other.loadAll()).toEqual([chat('O1')]);
    });

    it('filters and garbage-collects expired items on read', async () => {
        const contextProvider = { getContext: () => ({ cid: 'ttl', uid: 'user-ttl' }), setContext: () => undefined };
        const storage = createIndexedDBAdapter('user', contextProvider);
        const nowSpy = jest.spyOn(Date, 'now');

        nowSpy.mockReturnValue(1000);
        await storage.save('U1', { id: 'U1', cid: 'ttl', name: 'alive' } as any);

        nowSpy.mockReturnValue(1000 + 6 * 60 * 1000);
        expect(await storage.load('U1')).toBeNull();
        expect(await storage.loadAll()).toEqual([]);

        nowSpy.mockRestore();
    });
});

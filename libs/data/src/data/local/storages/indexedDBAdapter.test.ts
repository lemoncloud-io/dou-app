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
    it('isolates records by cid scope', async () => {
        const contextA = { getContext: () => ({ cid: 'cloud-a' }), setContext: () => undefined };
        const contextB = { getContext: () => ({ cid: 'cloud-b' }), setContext: () => undefined };

        const storageA = createIndexedDBAdapter('chat', contextA);
        const storageB = createIndexedDBAdapter('chat', contextB);

        await storageA.save('A1', chat('A1', { text: 'from-a' }));
        await storageB.save('B1', chat('B1', { text: 'from-b' }));

        expect(await storageA.loadAll()).toEqual([chat('A1', { text: 'from-a' })]);
        expect(await storageB.loadAll()).toEqual([chat('B1', { text: 'from-b' })]);
    });

    it('reads latest cid from contextProvider at call-time', async () => {
        const context = { cid: 'cloud-a' };
        const contextProvider = {
            getContext: () => ({ cid: context.cid }),
            setContext: (next: { cid: string }) => {
                context.cid = next.cid;
            },
        };

        const storage = createIndexedDBAdapter('chat', contextProvider);
        await storage.save('A1', chat('A1', { text: 'from-a' }));

        contextProvider.setContext({ cid: 'cloud-b' });
        await storage.save('B1', chat('B1', { text: 'from-b' }));

        expect(await storage.loadAll()).toEqual([chat('B1', { text: 'from-b' })]);

        contextProvider.setContext({ cid: 'cloud-a' });
        expect(await storage.loadAll()).toEqual([chat('A1', { text: 'from-a' })]);
    });

    it('replaceAll and clearAll affect only current cid scope', async () => {
        const scopeMain = { getContext: () => ({ cid: 'main' }), setContext: () => undefined };
        const scopeOther = { getContext: () => ({ cid: 'other' }), setContext: () => undefined };
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
});

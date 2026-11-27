import type { CacheChatView } from '@chatic/bridge-messages';
import type { DataContext, DataContextProvider } from '@chatic/data';

import { MEMORY_DB_ROUTE, memoryDbPorts } from '.';

const contextOf = (context: Partial<DataContext>): DataContextProvider => {
    let current = context as DataContext;
    return {
        getContext: () => current,
        setContext: next => {
            current = next;
        },
    };
};

const chat = (id: string, channelId: string, chatNo?: number): CacheChatView =>
    ({ id, channelId, ...(chatNo === undefined ? {} : { chatNo }) }) as CacheChatView;

describe('memoryDbPorts', () => {
    it('routes every domain to memory and refuses another route', () => {
        const db = memoryDbPorts();

        expect(db.route('chat')).toBe(MEMORY_DB_ROUTE);
        expect(() => db.storage('chat', 'web', contextOf({ uid: 'u' }), undefined)).toThrow(
            /unknown cache route 'web'/
        );
    });

    it('saves, loads and deletes rows in the session scope, as copies', async () => {
        const table = memoryDbPorts().storage('chat', MEMORY_DB_ROUTE, contextOf({ cid: 'c', uid: 'u' }), undefined);
        const item = chat('1', 'ch');

        await table.save('1', item);
        await table.saveAll([chat('2', 'ch'), chat('3', 'other'), {} as CacheChatView]);
        item.channelId = 'changed';

        const loaded = await table.load('1');
        expect(loaded?.channelId).toBe('ch');
        expect(loaded?.__cacheMeta?.expiresAt).toEqual(expect.any(Number));
        expect((await table.loadMany(['1', '9', '3'])).map(row => row.id)).toEqual(['1', '3']);

        await table.clearByChannelId('ch');
        expect((await table.loadAll()).map(row => row.id)).toEqual(['3']);

        await table.deleteAll(['3']);
        expect(await table.loadAll()).toEqual([]);
    });

    it('keeps each account and cloud apart, and reads nothing with no session', async () => {
        const db = memoryDbPorts();
        const mine = db.storage('chat', MEMORY_DB_ROUTE, contextOf({ cid: 'c', uid: 'u' }), undefined);
        const other = db.storage('chat', MEMORY_DB_ROUTE, contextOf({ cid: 'c', uid: 'v' }), undefined);
        const signedOut = db.storage('chat', MEMORY_DB_ROUTE, contextOf({}), undefined);

        await mine.save('1', chat('1', 'ch'));
        await signedOut.save('2', chat('2', 'ch'));

        expect(await other.load('1')).toBeNull();
        expect(await signedOut.loadAll()).toEqual([]);
        expect((await mine.loadAll()).map(row => row.id)).toEqual(['1']);

        await mine.clearAll();
        expect(await mine.loadAll()).toEqual([]);
    });

    it('reads a chat page the way the IndexedDB executor does: one channel, newest first, below the cursor', async () => {
        const table = memoryDbPorts().storage('chat', MEMORY_DB_ROUTE, contextOf({ cid: 'c', uid: 'u' }), undefined);
        await table.saveAll([
            chat('a1', 'a', 1),
            chat('a2', 'a', 2),
            chat('a3', 'a', 3),
            chat('b9', 'b', 9),
            chat('a-unsent', 'a'),
        ]);
        const ids = async (options: Parameters<typeof table.loadAll>[0]) =>
            (await table.loadAll(options)).map(row => row.id);

        expect(await ids({ channelId: 'a', limit: 2 })).toEqual(['a3', 'a2']);
        expect(await ids({ channelId: 'a', limit: 2, cursorNo: 3 })).toEqual(['a2', 'a1']);
        expect(await ids({ channelId: 'a', limit: 2, includeUnsent: true })).toEqual(['a3', 'a2', 'a-unsent']);
        expect(await ids({ channelId: 'a', cursorNo: 1, includeUnsent: true })).toEqual(['a-unsent']);
        expect((await ids(undefined)).sort()).toEqual(['a-unsent', 'a1', 'a2', 'a3', 'b9']);
    });

    it('pages a whole room to its end with the cursor', async () => {
        const table = memoryDbPorts().storage('chat', MEMORY_DB_ROUTE, contextOf({ cid: 'c', uid: 'u' }), undefined);
        await table.saveAll(Array.from({ length: 450 }, (_, index) => chat(`m${index + 1}`, 'room', index + 1)));

        let cursorNo: number | undefined;
        let read = 0;
        for (let pages = 0; pages < 10; pages++) {
            const page = await table.loadAll({ channelId: 'room', limit: 200, ...(cursorNo ? { cursorNo } : {}) });
            if (page.length === 0) break;
            read += page.length;
            cursorNo = page[page.length - 1].chatNo;
        }

        expect(read).toBe(450);
    });

    it('answers search and metrics with nothing', async () => {
        const db = memoryDbPorts();

        await expect(db.globalSearch().search('x', { uid: 'u' })).resolves.toEqual({
            channels: [],
            sites: [],
            chats: [],
        });
        expect(db.metrics().read()).toEqual({ totalOps: 0, operations: {} });
    });
});

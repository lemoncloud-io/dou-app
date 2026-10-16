import { MemoryCache } from './memoryCache';

const scope = { cid: 'c1', uid: 'u1' };

describe('MemoryCache', () => {
    it('lists chats newest first below a cursor, scoped by cloud and user', async () => {
        const cache = new MemoryCache();
        cache.seed('chat', scope, [
            { id: 'a', channelId: 'ch', chatNo: 1 },
            { id: 'b', channelId: 'ch', chatNo: 2 },
            { id: 'c', channelId: 'ch', chatNo: 3 },
            { id: 'd', channelId: 'other', chatNo: 4 },
        ]);
        cache.seed('chat', { cid: 'c2', uid: 'u1' }, [{ id: 'e', channelId: 'ch', chatNo: 5 }]);

        const reply = await cache
            .handlers()
            .FetchAllCacheData?.(
                { type: 'chat', ...scope, query: { channelId: 'ch', cursorNo: 3, limit: 5 } } as never,
                {} as never
            );

        expect((reply as { items: Array<{ id: string }> }).items.map(row => row.id)).toEqual(['b', 'a']);
    });

    it('forgets every row on clear, as wiping the app data does', () => {
        const cache = new MemoryCache();
        cache.seed('channel', scope, [{ id: 'x' }]);

        cache.clear();

        expect(cache.rows('channel', scope)).toEqual([]);
    });
    it('lists every row of a domain with the scope it is stored under', () => {
        const cache = new MemoryCache();
        cache.seed('channel', scope, [{ id: 'a' }]);
        cache.seed('channel', { cid: 'c2', uid: 'u1' }, [{ id: 'b' }]);
        cache.seed('chat', scope, [{ id: 'x' }]);

        expect(cache.entries('channel')).toEqual([
            { cid: 'c1', uid: 'u1', row: { id: 'a' } },
            { cid: 'c2', uid: 'u1', row: { id: 'b' } },
        ]);
    });
});

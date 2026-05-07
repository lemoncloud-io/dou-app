import type { CacheStorage } from '../storages';
import { ChatLocalDataSource } from './ChatLocalDataSource';

const createMemoryStorage = (): CacheStorage<'chat'> => {
    const map = new Map<string, any>();
    return {
        async save(id, item) {
            map.set(id, { ...item });
            return item;
        },
        async saveAll(items) {
            items.forEach(item => {
                if (!item?.id) return;
                map.set(item.id, { ...item });
            });
            return items;
        },
        async replaceAll(items) {
            map.clear();
            items.forEach(item => {
                if (!item?.id) return;
                map.set(item.id, { ...item });
            });
            return items;
        },
        async load(id) {
            return map.has(id) ? { ...map.get(id) } : null;
        },
        async loadAll() {
            return Array.from(map.values()).map(item => ({ ...item }));
        },
        async delete(id) {
            map.delete(id);
        },
        async deleteAll(ids) {
            ids.forEach(id => map.delete(id));
        },
        async clearAll() {
            map.clear();
        },
    };
};

describe('ChatLocalDataSource', () => {
    const contextProvider = {
        getContext: () => ({ cid: 'cloud-a', uid: 'user-a' }),
        setContext: () => undefined,
    };

    it('detects continuity gap from chatNo sequence', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ChatLocalDataSource(contextProvider, storage);

        await dataSource.upsertChats([
            { id: '1', channelId: 'ch-1', chatNo: 1, cid: 'cloud-a', createdAt: 1 },
            { id: '2', channelId: 'ch-1', chatNo: 3, cid: 'cloud-a', createdAt: 3 },
        ] as any);

        const continuity = await dataSource.checkContinuity('ch-1');
        expect(continuity.hasGap).toBe(true);
        expect(continuity.missingRanges).toEqual([{ from: 2, to: 2 }]);
    });

    it('updates partial chat fields without dropping previous values', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ChatLocalDataSource(contextProvider, storage);

        await dataSource.upsertChat({
            id: 'c1',
            channelId: 'ch-1',
            cid: 'cloud-a',
            content: 'before',
            chatNo: 10,
            createdAt: 1000,
        } as any);
        await dataSource.updateChatPartial('c1', { content: 'after' } as any);

        const loaded = await storage.load('c1');
        expect(loaded?.content).toBe('after');
        expect(loaded?.chatNo).toBe(10);
    });

    it('re-emits subscribed chat feed when local cache is mutated', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ChatLocalDataSource(contextProvider, storage);
        const emissions: number[] = [];

        const unsubscribe = dataSource.subscribeChatFeed({ channelId: 'ch-1', limit: 30 } as any, result =>
            emissions.push(result?.list.length ?? -1)
        );

        await Promise.resolve();
        await dataSource.upsertChat({
            id: 'stream-1',
            channelId: 'ch-1',
            chatNo: 1,
            cid: 'cloud-a',
            createdAt: 1,
        } as any);
        await dataSource.deleteChat('stream-1');
        unsubscribe();

        expect(emissions).toEqual([-1, 1, -1]);
    });
});

import type { CacheStorage } from '../storages';
import { ChatLocalDataSourceV2 } from './ChatLocalDataSourceV2';

// Emulate just enough query behavior to validate pagination and channel scoping.
const createMemoryStorage = (): CacheStorage<'chat'> => {
    const map = new Map<string, any>();
    return {
        async save(id, item) {
            map.set(id, { ...item });
            return item;
        },
        async saveAll(items) {
            items.forEach(item => item?.id && map.set(item.id, { ...item }));
            return items;
        },
        async load(id) {
            return map.has(id) ? { ...map.get(id) } : null;
        },
        async loadMany(ids) {
            // 계약대로 없는 id는 빼고, 순서도 보장하지 않습니다(뒤집어 돌려줍니다) — 위치로 짝을
            // 맞추는 코드가 여기서 반드시 깨지도록 두는 것이 이 fixture의 역할입니다.
            return ids
                .filter(id => map.has(id))
                .map(id => ({ ...map.get(id) }))
                .reverse();
        },
        async loadAll(options?: any) {
            let items = Array.from(map.values()).map(item => ({ ...item }));
            if (options?.channelId) {
                items = items.filter(item => item.channelId === options.channelId);
            }
            items.sort((a, b) => (a.chatNo ?? 0) - (b.chatNo ?? 0));
            if (options?.cursorNo) {
                items = items.filter(item => (item.chatNo ?? 0) < options.cursorNo);
            }
            if (options?.limit) {
                items = items.slice(-options.limit);
            }
            return items;
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
        async clearByChannelId(channelId: string) {
            Array.from(map.entries()).forEach(([id, item]) => {
                if (item.channelId === channelId) map.delete(id);
            });
        },
    };
};

describe('ChatLocalDataSourceV2', () => {
    const contextProvider = {
        current: { cid: 'cloud-a', sid: 'site-1', uid: 'me' },
        getContext() {
            return this.current;
        },
        setContext(context: any) {
            this.current = context;
        },
    };

    it('returns only the requested channel page and clears one channel without touching others', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ChatLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWriteMany([
            { id: 'm1', channelId: 'ch-1', chatNo: 1, content: 'a' } as any,
            { id: 'm2', channelId: 'ch-1', chatNo: 2, content: 'b' } as any,
            { id: 'm3', channelId: 'ch-2', chatNo: 3, content: 'c' } as any,
        ]);

        const beforeClear = await dataSource.cacheReadList({ channelId: 'ch-1', limit: 50 } as any);
        // The initial read should only include the requested channel.
        expect(beforeClear?.list.map(item => item.id)).toEqual(['m1', 'm2']);

        await dataSource.cacheClearByChannelId('ch-1');

        const afterClear = await dataSource.cacheReadList({ channelId: 'ch-1', limit: 50 } as any);
        const otherChannel = await dataSource.cacheReadList({ channelId: 'ch-2', limit: 50 } as any);

        // Clearing one channel must not remove messages from other channels in the same scope.
        expect(afterClear?.list).toEqual([]);
        expect(otherChannel?.list.map(item => item.id)).toEqual(['m3']);
    });

    it('throws when chat list input is missing channelId instead of returning an empty fallback', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ChatLocalDataSourceV2(contextProvider as any, storage);

        await expect(dataSource.cacheReadList({ limit: 50 } as any)).rejects.toThrow(
            '[LocalDataSourceV2] channelId is required.'
        );
    });

    it('supports cursor-based paging for older messages instead of returning the latest page again', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ChatLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWriteMany([
            { id: 'm1', channelId: 'ch-1', chatNo: 1, content: 'a' } as any,
            { id: 'm2', channelId: 'ch-1', chatNo: 2, content: 'b' } as any,
            { id: 'm3', channelId: 'ch-1', chatNo: 3, content: 'c' } as any,
        ]);

        const olderPage = await dataSource.cacheReadList({ channelId: 'ch-1', cursorNo: 3, limit: 2 } as any);

        // A cursor should page older messages instead of repeating the live tail.
        expect(olderPage?.list.map(item => item.id)).toEqual(['m1', 'm2']);
    });
});

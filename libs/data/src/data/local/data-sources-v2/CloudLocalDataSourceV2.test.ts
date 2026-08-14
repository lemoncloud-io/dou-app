import type { CacheStorage } from '../storages';
import { CloudLocalDataSourceV2 } from './CloudLocalDataSourceV2';

// Observer notifications are debounced, so flush the microtask queue after timers run.
const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

const createMemoryStorage = (): CacheStorage<'invitecloud'> => {
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
        async clearByChannelId() {
            return undefined;
        },
    };
};

describe('CloudLocalDataSourceV2', () => {
    const contextProvider = {
        current: { cid: 'cloud-a', sid: 'site-1', uid: 'me' },
        getContext() {
            return this.current;
        },
        setContext(context: any) {
            this.current = context;
        },
    };

    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('re-emits the cloud list after a mutation so the local-first repository stays reactive', async () => {
        const storage = createMemoryStorage();
        const dataSource = new CloudLocalDataSourceV2(contextProvider as any, storage);
        const totals: number[] = [];

        const unsubscribe = dataSource.observeList(undefined as void, result => {
            totals.push(result?.meta.total ?? 0);
        });

        // Flush the initial empty emission before mutating the datasource.
        jest.runAllTimers();
        await flushPromises();

        await dataSource.cacheWrite({ id: 'cloud-1', cid: 'cloud-1', name: 'Cloud One' } as any);

        // Flush the debounced re-emit that follows the write.
        jest.runAllTimers();
        await flushPromises();

        unsubscribe();

        expect(totals).toEqual([0, 1]);
    });

    it('clears all clouds so local state can be reset between sessions', async () => {
        const storage = createMemoryStorage();
        const dataSource = new CloudLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWriteMany([
            { id: 'cloud-1', cid: 'cloud-1', name: 'One' } as any,
            { id: 'cloud-2', cid: 'cloud-2', name: 'Two' } as any,
        ]);
        await dataSource.cacheClear();

        const result = await dataSource.cacheReadList();

        // Clearing should leave the local list in a stable empty state.
        expect(result?.list).toEqual([]);
    });

    it('defaults an unclassified write to the invited cloudType and preserves an explicit one', async () => {
        const storage = createMemoryStorage();
        const dataSource = new CloudLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWrite({ id: 'cloud-1', cid: 'cloud-1', name: 'One' } as any);
        await dataSource.cacheWrite({ id: 'cloud-2', cid: 'cloud-2', name: 'Two', cloudType: 'owner' } as any);

        // Unclassified clouds fall back to 'invited'; explicit ownership is kept verbatim.
        expect((await dataSource.cacheRead('cloud-1'))?.cloudType).toBe('invited');
        expect((await dataSource.cacheRead('cloud-2'))?.cloudType).toBe('owner');
    });
});

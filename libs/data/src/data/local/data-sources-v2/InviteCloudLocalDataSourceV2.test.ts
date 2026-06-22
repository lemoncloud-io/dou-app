import type { CacheStorage } from '../storages';
import { InviteCloudLocalDataSourceV2 } from './InviteCloudLocalDataSourceV2';

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

describe('InviteCloudLocalDataSourceV2', () => {
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

    it('re-emits the invite cloud list after a mutation so the local-only repository stays reactive', async () => {
        const storage = createMemoryStorage();
        const dataSource = new InviteCloudLocalDataSourceV2(contextProvider as any, storage);
        const totals: number[] = [];

        const unsubscribe = dataSource.observeList(undefined as void, result => {
            totals.push(result?.meta.total ?? 0);
        });

        // Flush the initial empty emission before mutating the datasource.
        jest.runAllTimers();
        await flushPromises();

        await dataSource.cacheWrite({ id: 'cloud-1', name: 'Cloud One' } as any);

        // Flush the debounced re-emit that follows the write.
        jest.runAllTimers();
        await flushPromises();

        unsubscribe();

        expect(totals).toEqual([0, 1]);
    });

    it('clears all invite clouds so local-only state can be reset between sessions', async () => {
        const storage = createMemoryStorage();
        const dataSource = new InviteCloudLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWriteMany([{ id: 'cloud-1', name: 'One' } as any, { id: 'cloud-2', name: 'Two' } as any]);
        await dataSource.cacheClear();

        const result = await dataSource.cacheReadList();

        // Clearing should leave the local-only list in a stable empty state.
        expect(result?.list).toEqual([]);
    });
});

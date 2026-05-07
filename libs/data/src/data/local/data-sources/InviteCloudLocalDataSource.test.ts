import type { CacheStorage } from '../storages';
import { InviteCloudLocalDataSource } from './InviteCloudLocalDataSource';

const createMemoryStorage = (): CacheStorage<'invitecloud'> => {
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

describe('InviteCloudLocalDataSource', () => {
    const contextProvider = {
        current: { cid: 'cloud-a', uid: 'user-a' },
        getContext() {
            return this.current;
        },
        setContext(context: any) {
            this.current = context;
        },
    };

    it('saves and loads invite cloud records', async () => {
        const storage = createMemoryStorage();
        const dataSource = new InviteCloudLocalDataSource(contextProvider as any, storage);

        await dataSource.saveInviteCloud('i1', { name: 'Cloud One', cid: 'cloud-a' } as any);
        const loaded = await dataSource.getInviteCloud('i1');

        expect(loaded?.id).toBe('i1');
        expect(loaded?.name).toBe('Cloud One');
    });

    it('re-emits subscribed invite cloud list when cache is mutated', async () => {
        const storage = createMemoryStorage();
        const dataSource = new InviteCloudLocalDataSource(contextProvider as any, storage);
        const emissions: number[] = [];

        const unsubscribe = dataSource.subscribeInviteClouds(items => {
            emissions.push(items.length);
        });

        await Promise.resolve();
        await dataSource.saveInviteCloud('i1', { name: 'Cloud One', cid: 'cloud-a' } as any);
        await dataSource.deleteInviteCloud('i1');
        unsubscribe();

        expect(emissions).toEqual([0, 1, 0]);
    });
});

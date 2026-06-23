import type { CacheStorage } from '../storages';
import { ChannelLocalDataSourceV2 } from './ChannelLocalDataSourceV2';

// Keep storage behavior intentionally minimal so list filtering/sorting is tested in the datasource itself.
const createMemoryStorage = (): CacheStorage<'channel'> => {
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

describe('ChannelLocalDataSourceV2', () => {
    const contextProvider = {
        current: { cid: 'cloud-a', sid: 'site-1', uid: 'me' },
        getContext() {
            return this.current;
        },
        setContext(context: any) {
            this.current = context;
        },
    };

    it('filters channels by the active place and sorts the newest activity first', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ChannelLocalDataSourceV2(contextProvider as any, storage);

        // Seed two channels for the active place and one for another place.
        // `lastActivityAt` is the domain sort field (mapped upstream); the local cache sorts on it directly.
        await dataSource.cacheWriteMany([
            { id: 'ch-1', sid: 'site-1', name: 'Older', lastActivityAt: 100 } as any,
            { id: 'ch-2', sid: 'site-1', name: 'Newer', lastActivityAt: 300 } as any,
            { id: 'ch-3', sid: 'site-2', name: 'Other place', lastActivityAt: 999 } as any,
        ]);

        const result = await dataSource.cacheReadList({ sid: 'site-1' } as any);

        // Only the requested place should remain, ordered by the latest activity timestamp.
        expect(result?.list.map(item => item.id)).toEqual(['ch-2', 'ch-1']);
    });

    it('removes deleted channels from later reads so bulk list consumers do not see stale entries', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ChannelLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWriteMany([
            { id: 'ch-1', sid: 'site-1', name: 'Keep' } as any,
            { id: 'ch-2', sid: 'site-1', name: 'Delete' } as any,
        ]);
        await dataSource.cacheDelete('ch-2');

        const result = await dataSource.cacheReadList({ sid: 'site-1' } as any);

        // Deletes must affect subsequent list reads so higher layers never see resurrected channels.
        expect(result?.list.map(item => item.id)).toEqual(['ch-1']);
    });

    describe('상위 DataContext 따라가기 (독립 동작 안 함)', () => {
        it('contextOverride가 주어지면 provider보다 우선해 cid/sid를 적용한다', async () => {
            const storage = createMemoryStorage();
            const dataSource = new ChannelLocalDataSourceV2(contextProvider as any, storage);

            await dataSource.cacheWrite({ id: 'ch-1', name: 'Override' } as any, {
                cid: 'cloud-b',
                sid: 'site-2',
                uid: 'me',
            });

            const item = await dataSource.cacheRead('ch-1');
            expect(item).toMatchObject({ id: 'ch-1', cid: 'cloud-b', sid: 'site-2' });
        });

        it('override가 없으면 provider context의 cid/sid를 따른다', async () => {
            const storage = createMemoryStorage();
            const dataSource = new ChannelLocalDataSourceV2(contextProvider as any, storage);

            await dataSource.cacheWrite({ id: 'ch-1', name: 'Provider' } as any);

            const item = await dataSource.cacheRead('ch-1');
            expect(item).toMatchObject({ id: 'ch-1', cid: 'cloud-a', sid: 'site-1' });
        });

        it('sid가 context/아이템 어디에도 없으면 명확한 에러를 던진다', async () => {
            const storage = createMemoryStorage();
            const noSidProvider = {
                getContext: () => ({ cid: 'cloud-a', uid: 'me' }),
                setContext: () => undefined,
            };
            const dataSource = new ChannelLocalDataSourceV2(noSidProvider as any, storage);

            await expect(dataSource.cacheWrite({ id: 'ch-1' } as any)).rejects.toThrow(/sid is required/);
        });
    });
});

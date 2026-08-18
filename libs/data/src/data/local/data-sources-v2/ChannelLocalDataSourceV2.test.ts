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

    it('filters channels by the active place and sorts by id ascending', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ChannelLocalDataSourceV2(contextProvider as any, storage);

        // Seed two channels for the active place and one for another place.
        // The local cache orders by id, not by activity.
        await dataSource.cacheWriteMany([
            { id: 'ch-2', sid: 'site-1', name: 'Newer' } as any,
            { id: 'ch-1', sid: 'site-1', name: 'Older' } as any,
            { id: 'ch-3', sid: 'site-2', name: 'Other place' } as any,
        ]);

        const result = await dataSource.cacheReadList({ sid: 'site-1' } as any);

        // Only the requested place should remain, ordered by id (not by latest activity).
        expect(result?.list.map(item => item.id)).toEqual(['ch-1', 'ch-2']);
    });

    it('sorts channel ids numerically (10 after 2, not lexicographically)', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ChannelLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWriteMany([
            { id: '10', sid: 'site-1', name: 'Ten' } as any,
            { id: '2', sid: 'site-1', name: 'Two' } as any,
            { id: '1', sid: 'site-1', name: 'One' } as any,
        ]);

        const result = await dataSource.cacheReadList({ sid: 'site-1' } as any);

        expect(result?.list.map(item => item.id)).toEqual(['1', '2', '10']);
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

    // The channel cache is cloud-wide, so the observer scope must key by {cid, uid} only — NOT the
    // transient active sid. Otherwise a cloud/site switch (which changes the provider sid) reemits
    // under a scope the cloud-wide observer never subscribed to, and the rail stays stale until a
    // manual refresh (the P1 bug). This locks the sid-independent reemit routing.
    describe('cloud-wide reemit routing is sid-independent (P1)', () => {
        const flush = () => jest.advanceTimersByTimeAsync(60); // past the 50ms reemit debounce

        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        it('reemits a cloud-wide observer even when the active sid differs from subscribe time', async () => {
            const storage = createMemoryStorage();
            const provider = {
                current: { cid: 'cloud-a', sid: 'site-1', uid: 'me' },
                getContext() {
                    return this.current;
                },
                setContext(c: any) {
                    this.current = c;
                },
            };
            const dataSource = new ChannelLocalDataSourceV2(provider as any, storage);

            const cb = jest.fn();
            // Cloud-wide subscription (sid: '') taken while the active place is site-1.
            dataSource.observeList({ sid: '' } as any, cb);
            await flush();
            cb.mockClear();

            // Active place moves to site-2, then a channel for site-2 is written. A scope keyed by sid
            // would route this reemit to a different key and miss the observer.
            provider.setContext({ cid: 'cloud-a', sid: 'site-2', uid: 'me' });
            await dataSource.cacheWrite({ id: 'ch-9', sid: 'site-2', name: 'New site channel' } as any);
            await flush();

            expect(cb).toHaveBeenCalled();
            expect(cb.mock.calls.at(-1)?.[0]?.list.map((c: any) => c.id)).toContain('ch-9');
        });
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

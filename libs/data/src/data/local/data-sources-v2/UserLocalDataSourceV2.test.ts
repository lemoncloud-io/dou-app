import type { CacheStorage } from '../storages';
import { UserLocalDataSourceV2 } from './UserLocalDataSourceV2';

// The storage fixture is deliberately naive so channel-member resolution is owned by the datasource.
const createMemoryStorage = (): CacheStorage<'user'> => {
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

describe('UserLocalDataSourceV2', () => {
    const contextProvider = {
        current: { cid: 'cloud-a', sid: 'site-1', uid: 'me' },
        getContext() {
            return this.current;
        },
        setContext(context: any) {
            this.current = context;
        },
    };

    it('매핑된 channelIds 멤버십으로 채널 멤버를 필터링한다', async () => {
        const storage = createMemoryStorage();
        const dataSource = new UserLocalDataSourceV2(contextProvider as any, storage);

        // Channel membership arrives pre-mapped as `channelIds` (resolved upstream from channelId/$join).
        await dataSource.cacheWriteMany([
            { id: 'u1', channelIds: ['ch-1'], name: 'Direct' } as any,
            { id: 'u2', channelIds: ['ch-1'], name: 'Nested' } as any,
            { id: 'u3', channelIds: ['ch-2'], name: 'Other' } as any,
        ]);

        const result = await dataSource.cacheReadList({ channelId: 'ch-1' } as any);

        expect(result?.list.map(item => item.id)).toEqual(['u1', 'u2']);
    });

    it('reads multiple users by id in one call so higher-level assemblers can hydrate batched lookups', async () => {
        const storage = createMemoryStorage();
        const dataSource = new UserLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWriteMany([{ id: 'u1', name: 'One' } as any, { id: 'u2', name: 'Two' } as any]);

        const users = await dataSource.cacheReadMany(['u1', 'u2']);

        // Batched reads should preserve the requested set without forcing callers into N single-item reads.
        //
        // 집합으로 단언합니다 — 순서는 계약이 아닙니다. 네이티브에서는 이게 `id IN (...)` 한 방으로
        // 내려가고 SQLite가 돌려주는 순서를 그대로 쓰므로, 요청 순서와 같다고 약속할 수 없습니다.
        // (fixture가 일부러 뒤집어 돌려주는 이유도 이 단언이 순서에 기대지 못하게 하려는 것입니다.)
        expect(users.map(user => user.id).sort()).toEqual(['u1', 'u2']);
    });

    it('drops ids that are not cached instead of returning holes, so callers can index by id', async () => {
        const storage = createMemoryStorage();
        const dataSource = new UserLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWriteMany([{ id: 'u1', name: 'One' } as any]);

        const users = await dataSource.cacheReadMany(['u1', 'missing']);

        expect(users.map(user => user.id)).toEqual(['u1']);
    });
});

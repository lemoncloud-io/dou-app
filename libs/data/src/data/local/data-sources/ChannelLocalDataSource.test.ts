import type { CacheStorage } from '../storages';
import { ChannelLocalDataSource } from './ChannelLocalDataSource';

// 대기 중인 모든 Promise(마이크로태스크)를 처리하도록 기다려주는 유틸리티
const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

const createMemoryStorage = (): CacheStorage<'channel'> => {
    const map = new Map<string, any>();
    return {
        async save(id, item) {
            map.set(id, { ...item });
            return item;
        },
        async saveAll(items) {
            items.forEach(item => {
                if (item?.id) map.set(item.id, { ...item });
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

describe('ChannelLocalDataSource', () => {
    const contextProvider = {
        getContext: () => ({ cid: 'cloud-a', uid: 'user-a', sid: 'place-a' }),
        setContext: () => undefined,
    };

    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('sorts channels by latest activity and applies page/limit', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ChannelLocalDataSource(contextProvider, storage);

        await dataSource.upsertMany([
            { id: 'c1', sid: 'place-a', cid: 'cloud-a', updatedAt: 10 },
            { id: 'c2', sid: 'place-a', cid: 'cloud-a', updatedAt: 20 },
            { id: 'c3', sid: 'place-a', cid: 'cloud-a', updatedAt: 30 },
        ] as any);

        const result = await dataSource.fetchList({ page: 0, limit: 2 } as any);

        expect(result?.list.map(item => item.id)).toEqual(['c3', 'c2']);
        expect(result?.meta?.total).toBe(3);
    });

    it('re-emits subscribed channel list when cache is mutated', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ChannelLocalDataSource(contextProvider, storage);
        const emissions: number[] = [];

        // 1. 구독 시작 (초기 상태이므로 0 방출 대기)
        const unsubscribe = dataSource.subscribeList({ page: 0, limit: 10 } as any, result =>
            emissions.push(result?.meta?.total ?? 0)
        );

        jest.runAllTimers();
        await flushPromises();

        // 2. 데이터 추가 (1 방출 기대)
        await dataSource.upsert({ id: 'c1', sid: 'place-a', cid: 'cloud-a', updatedAt: 1 } as any);

        jest.runAllTimers(); // debounce 타이머 실행
        await flushPromises(); // 내부 비동기 fetch 완료 대기

        // 3. 데이터 삭제 (0 방출 기대)
        await dataSource.remove('c1');

        jest.runAllTimers(); // debounce 타이머 실행
        await flushPromises(); // 내부 비동기 fetch 완료 대기

        unsubscribe();

        expect(emissions).toEqual([0, 1, 0]);
    });
});

import type { CacheStorage } from '../storages';
import { UserLocalDataSource } from './UserLocalDataSource';

// 대기 중인 모든 Promise(마이크로태스크)를 처리하도록 기다려주는 유틸리티
const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

const createMemoryStorage = (): CacheStorage<'user'> => {
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

describe('UserLocalDataSource', () => {
    const contextProvider = {
        getContext: () => ({ cid: 'cloud-a', uid: 'user-a' }),
        setContext: () => undefined,
    };

    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('fetches users filtered by channelId', async () => {
        const storage = createMemoryStorage();
        const dataSource = new UserLocalDataSource(contextProvider, storage);

        await dataSource.upsertMany([
            { id: 'u1', cid: 'cloud-a', name: 'A', $join: { channelId: 'ch-1' } },
            { id: 'u2', cid: 'cloud-a', name: 'B', channelId: 'ch-1' },
            { id: 'u3', cid: 'cloud-a', name: 'C', channelId: 'ch-2' },
        ] as any);

        const result = await dataSource.fetchList({ channelId: 'ch-1' } as any);

        expect(result?.list.map(item => item.id).sort()).toEqual(['u1', 'u2']);
    });

    it('re-emits subscribed user list when cache is mutated', async () => {
        const storage = createMemoryStorage();
        const dataSource = new UserLocalDataSource(contextProvider, storage);
        const emissions: number[] = [];

        // 1. 구독 시작 (초기 상태이므로 0 방출 대기)
        const unsubscribe = dataSource.subscribeList({ channelId: 'ch-1' } as any, result => {
            emissions.push(result?.meta?.total ?? 0);
        });

        jest.runAllTimers();
        await flushPromises();

        // 2. 데이터 추가 (1 방출 기대)
        await dataSource.upsert({ id: 'u1', cid: 'cloud-a', name: 'A', channelId: 'ch-1' } as any);

        jest.runAllTimers(); // debounce 타이머 실행
        await flushPromises(); // 내부 비동기 fetch 완료 대기

        // 3. 데이터 삭제 (0 방출 기대)
        await dataSource.remove('u1');

        jest.runAllTimers(); // debounce 타이머 실행
        await flushPromises(); // 내부 비동기 fetch 완료 대기

        unsubscribe();

        expect(emissions).toEqual([0, 1, 0]);
    });
});

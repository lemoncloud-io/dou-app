import type { CacheStorage } from '../storages';
import { ChatLocalDataSource } from './ChatLocalDataSource';

// 대기 중인 모든 Promise(마이크로태스크)를 처리하도록 기다려주는 유틸리티
const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

const createMemoryStorage = (): CacheStorage<'chat'> => {
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

describe('ChatLocalDataSource', () => {
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

    it('updates partial chat fields without dropping previous values', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ChatLocalDataSource(contextProvider, storage);

        await dataSource.upsert({
            id: 'c1',
            channelId: 'ch-1',
            cid: 'cloud-a',
            content: 'before',
            chatNo: 10,
            createdAt: 1000,
        } as any);
        await dataSource.upsert({ id: 'c1', content: 'after' } as any);

        const loaded = await storage.load('c1');
        expect(loaded?.content).toBe('after');
        expect(loaded?.chatNo).toBe(10);
    });

    it('preserves existing fields (e.g. owner$) when upsertMany omits them', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ChatLocalDataSource(contextProvider, storage);

        // A detail fetch cached the author (owner$ embedded).
        await dataSource.upsert({
            id: 'c1',
            channelId: 'ch-1',
            cid: 'cloud-a',
            content: 'hi',
            chatNo: 5,
            createdAt: 1000,
            owner$: { id: 'user-b', name: '개발자' },
        } as any);

        // A later list fetch (bulk) omits owner$ for other users — must not drop it.
        await dataSource.upsertMany([
            { id: 'c1', channelId: 'ch-1', cid: 'cloud-a', content: 'hi', chatNo: 5, createdAt: 1000 } as any,
        ]);

        const loaded = await storage.load('c1');
        expect((loaded as any)?.owner$?.name).toBe('개발자');
        expect(loaded?.content).toBe('hi');
    });

    it('re-emits subscribed chat feed when local cache is mutated', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ChatLocalDataSource(contextProvider, storage);
        const emissions: number[] = [];

        // 1. 구독 시작 (초기 상태이므로 0 방출)
        const unsubscribe = dataSource.subscribeItem('stream-1', result => emissions.push(result ? 1 : 0));
        jest.runAllTimers();
        await flushPromises();

        // 2. 데이터 추가 (1 방출 기대)
        await dataSource.upsert({
            id: 'stream-1',
            channelId: 'ch-1',
            chatNo: 1,
            cid: 'cloud-a',
            createdAt: 1,
        } as any);

        jest.runAllTimers(); // debounce 타이머 실행
        await flushPromises(); // 내부 비동기 fetch(getById) 완료 대기

        // 3. 데이터 삭제 (0 방출 기대)
        await dataSource.remove('stream-1');

        jest.runAllTimers(); // debounce 타이머 실행
        await flushPromises(); // 내부 비동기 fetch(getById) 완료 대기

        unsubscribe();

        expect(emissions).toEqual([0, 1, 0]);
    });
});
